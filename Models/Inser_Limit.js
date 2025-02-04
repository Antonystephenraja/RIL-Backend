import mongoose from "mongoose";
const insertlimit = new mongoose.Schema({
    Id:String,
    MinLimit:String,
    MaxLimit:String,
    Time:String
})
const InsetLimit = mongoose.model('Limit',insertlimit)
export default InsetLimit