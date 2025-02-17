import mongoose from 'mongoose';

const loginSchema = new mongoose.Schema({
  UserName: { type: String, }, // Ensure this is required and unique
  Password: { type: String, },
  Role: { type: String, },
});

const loginModel = mongoose.model("RilUserNew", loginSchema);
export default loginModel;