import mongoose from "mongoose";
const EmailAlertSchema = new mongoose.Schema({
    SensorId: { type: String, required: true, unique: true },
    Sensor1: { type: String, default: null }, // Storing values as strings (modify type if needed)
    Sensor2: { type: String, default: null },
    Sensor3: { type: String, default: null },
});
const EmailAlert = mongoose.model("EmailAlert", EmailAlertSchema);
export default EmailAlert;