import mongoose, { mongo } from "mongoose";
const Authmodel = new mongoose.Schema({
    token:[Object],
})
const AuthModel = mongoose.model("InsertAuth",Authmodel)
export default AuthModel;