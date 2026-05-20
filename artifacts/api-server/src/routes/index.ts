import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import imagesRouter from "./images";
import categoriesRouter from "./categories";
import tasksRouter from "./tasks";
import guideImagesRouter from "./guideImages";
import videosRouter from "./videos";
import videoTasksRouter from "./videoTasks";
import ecountRouter from "./ecount";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(imagesRouter);
router.use(categoriesRouter);
router.use(tasksRouter);
router.use(guideImagesRouter);
router.use(videoTasksRouter);
router.use(videosRouter);
router.use(ecountRouter);

export default router;
