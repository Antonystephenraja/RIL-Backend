import express from "express";
import {
  login,
  signup,
  validateToken,
  Insert,
  insertAuth,
  GetData,
  InsetLimit,
  getRilReport,
  getRilAverageReport,
} from "../api_v1/api.js";

const router = express.Router();
router.get("/hindalcoSignup", signup);
router.post("/login", login);
router.post("/validateToken", validateToken);
router.post("/InsertData", Insert);
router.get("/Auth", insertAuth);
router.get("/DataCollection", GetData);
router.post("/InserLimit", InsetLimit);
router.get("/getRilReport", getRilReport);
router.get("/getRilAverageReport", getRilAverageReport);

export default router;
