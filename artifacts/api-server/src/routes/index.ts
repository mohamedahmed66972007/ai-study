import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import questionsRouter from "./questions";
import quizzesRouter from "./quizzes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(questionsRouter);
router.use(quizzesRouter);

export default router;
