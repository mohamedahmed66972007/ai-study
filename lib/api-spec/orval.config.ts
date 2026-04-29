import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

// Strip multipart/form-data endpoints from the spec passed to the zod
// generator. Multipart bodies generate a TS type with `Blob`/`File`
// references that clash with the zod schema of the same name in the
// combined `api.ts` re-export. The server uses multer for multipart, not
// zod validation, so removing them is safe.
const stripMultipartTransformer: InputTransformerFn = (config) => {
  titleTransformer(config);
  for (const pathItem of Object.values(config.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of [
      "get",
      "post",
      "put",
      "patch",
      "delete",
    ] as const) {
      const op = (pathItem as Record<string, unknown>)[method] as
        | { requestBody?: { content?: Record<string, unknown> } }
        | undefined;
      const content = op?.requestBody?.content;
      if (content && "multipart/form-data" in content) {
        delete (pathItem as Record<string, unknown>)[method];
      }
    }
  }
  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: stripMultipartTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
            body: ['bigint', 'date'],
            response: ['bigint', 'date'],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});
