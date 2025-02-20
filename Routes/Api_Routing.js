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
  AutoReport,TestData,MailAlert
} from "../api_v1/api.js";

const router = express.Router();
router.post("/signup", signup);
router.post("/login", login);
router.post("/validateToken", validateToken);
router.post("/InsertData", Insert);
router.get("/Auth", insertAuth);
router.get("/DataCollection", GetData);
router.post("/InserLimit", InsetLimit);
router.get("/getRilReport", getRilReport);
router.get("/getRilAverageReport", getRilAverageReport);
router.get("/autoreport",AutoReport);
router.post("/mailAlret",MailAlert);
router.get("/tesing",TestData);

export default router;
