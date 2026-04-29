import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import questionsRouter from "./questions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(questionsRouter);

export default router;
