import mongoose from "mongoose";
const insertdata = new mongoose.Schema({
    Id:String,
    Sensor1:String,
    Sensor2:String,
    Sensor3:String,
    Sensor4:String,
    Time:String
})

const InsertModel = mongoose.model('Insert',insertdata);
export default InsertModel