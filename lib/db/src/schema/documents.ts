import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  filename: text("filename").notNull(),
  totalPages: integer("total_pages").notNull().default(0),
  status: text("status").notNull().default("processing"),
  errorMessage: text("error_message"),
  fileData: bytea("file_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentRow = typeof documentsTable.$inferSelect;

export const documentPagesTable = pgTable(
  "document_pages",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    pageLabel: text("page_label"),
    content: text("content").notNull(),
  },
  (t) => ({
    docIdx: index("document_pages_doc_idx").on(t.documentId, t.pageNumber),
  }),
);

export const insertDocumentPageSchema = createInsertSchema(
  documentPagesTable,
).omit({ id: true });
export type InsertDocumentPage = z.infer<typeof insertDocumentPageSchema>;
export type DocumentPageRow = typeof documentPagesTable.$inferSelect;
