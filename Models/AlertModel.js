import mongoose from "mongoose";

const AlertSchema = new mongoose.Schema({
  sensor: { type: String, required: true },
  lastSent: { type: Date, required: true },
});
const AlertSystem = mongoose.model("Alert", AlertSchema);
export default AlertSystem