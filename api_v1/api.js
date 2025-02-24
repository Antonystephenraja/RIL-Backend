import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import PDFDocument from "pdfkit"
import fs from 'fs';
import nodemailer from "nodemailer";
import cron from "node-cron";
import InsertModel from "../Models/InsertModel.js";
import InsertLimit from "../Models/Inser_Limit.js";
import AuthModel from "../Models/Insert_Auth.js";
import path from "path";
import streamBuffers from "stream-buffers";
import { fileURLToPath } from "url";
import moment from "moment/moment.js";
import AlertSystem from "../Models/AlertModel.js";
import loginModel from "../Models/LoginModel.js";
import EmailAlert from "../Models/MailAlert.js";


//from mail address
const transporter = nodemailer.createTransport({
  service: "Outlook",
  auth: {
    user: "alert@xyma.in",
    pass: "ylfzzjzbksfcbxjz",
  },
});

// http://localhost:4000/backend/signup?Username=[username]&Password=[password]
export const signup = async (req, res) => {
  try { 
    const { UserName, Password,Role } = req.body;
    if (!UserName || !Password ||!Role) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const hashedPassword = await bcrypt.hash(Password, 10);
    const newUser = await loginModel.create({
      UserName,
      Password: hashedPassword,
      Role,
    });
    res.status(200).json({ message: "User registered successfully", user: newUser });
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).json({ message: "Error creating user", error: error.message });
  }
};

// final
export const login = (req, res) => {
  const { UserName, Password } = req.body;
  loginModel
    .findOne({ UserName })
    .then((user) => {
      if (user) {
        bcrypt.compare(Password, user.Password, (err, response) => {
          if (response) {
            const redirectUrl = "/";
            const token = jwt.sign(
              { UserName: user.UserName },
              "jwt-secret-key-123"
            );
            const userRole = user.Role;
            res.json({ token, redirectUrl,userRole});
          } else {
            res.json("Incorrect password");
          }
        });
      } else {
        res.json("User not found");
      }
    })
    .catch((error) => {
      console.log(error);
    });
};

// token validation
export const validateToken = (req, res) => {
  const token = req.headers["authorization"];
  //   if (!token) {
  //     return res.status(401).json({ valid: false });
  //   }

  jwt.verify(token, "jwt-secret-key-123", (err, user) => {
    if (err) {
      return res.status(403).json({ valid: false });
    } else {
      res.json({ valid: true });
    }
  });

  //   if (!token) {
  //     return res.json({ valid: false });
  //   }
};

// http://localhost:4000/backend/Auth
export const insertAuth = async (req, res) => {
  // Generate a token
  const token = jwt.sign({ username: "stephen" }, "jwt_auth_v1");
  // const token = jwt.sign({ username: "stephen" }, "jwt_auth_v1", { expiresIn: "1h" });
  try {
    // Create a new document with the token
    const newData = new AuthModel({ token: [{ value: token }] });
    await newData.save();

    return res
      .status(201)
      .json({ message: "Token inserted successfully", data: newData });
  } catch (error) {
    return res.status(500).json({ message: "Invalid", error: error.message }); // Changed status to 500 for server errors
  }
};


// http://localhost:4000/backend/InsertData
export const Insert = async (req, res) => {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }
  try {
    const decoded = jwt.verify(token.split(" ")[1], "jwt_auth_v1"); // Extract token after "Bearer"
    const isTokenValid = await AuthModel.findOne({
      "token.value": token.split(" ")[1],
    });
    if (!isTokenValid) {
      return res.status(403).json({ message: "Invalid token" });
    }
    const { Id, Sensor1, Sensor2, Sensor3, Sensor4, Time } = req.body;
    // console.log("time=",Time,"And formated time=",formattedTime)
    const newData = new InsertModel({
      Id,
      Sensor1,
      Sensor2,
      Sensor3,
      Sensor4,
      Time,
    });

    await newData.save();
    res.status(200).json({ message: "Data inserted successfully", data: newData });
    try {
      const findemaillimit = await EmailAlert.findOne({});
      if (!findemaillimit) {
        console.error("Email alert limits not found");
        return;
      }
      let exceededSensors = [];
      if (Sensor1 > parseInt(findemaillimit.Sensor1)) {
        exceededSensors.push({ name: "Sensor1", value: Sensor1 });
      }
      if (Sensor2 > parseInt(findemaillimit.Sensor2)) {
        exceededSensors.push({ name: "Sensor2", value: Sensor2 });
      }
      if (Sensor3 > parseInt(findemaillimit.Sensor3)) {
        exceededSensors.push({ name: "Sensor3", value: Sensor3 });
      }
      if (exceededSensors.length === 0) {
        console.log("No sensors exceeded limits");
        return;
      }
      const currentTime = moment();
      const lastAlerts = await AlertSystem.find({ sensor: { $in: exceededSensors.map(s => s.name) } });
      exceededSensors = exceededSensors.filter(sensor => {
        const lastAlert = lastAlerts.find(alert => alert.sensor === sensor.name);
        if (!lastAlert) return true;

        const lastAlertTime = moment(lastAlert.lastSent);
        return currentTime.diff(lastAlertTime, "minutes") >= 10;
      });
      if (exceededSensors.length === 0) {
        console.log("Alerts already sent recently");
        return;
      }
      const allUsers = await loginModel.find({}, "UserName");
      const userMailIds = allUsers.map(user => user.UserName).join(",");
      const emailContent = exceededSensors
        .map(sensor => `Sensor: ${sensor.name}\nRecorded Temperature: ${sensor.value}°C`)
        .join("\n\n");
      
        const mailOptions = {
          from: "alert@xyma.in",
          to: userMailIds ? userMailIds : "stephen@xyma.in",
          // to: "stephen@xyma.in",

          subject: "⚠️ Alert: Sensors Exceeded Safe Limits",
          text: `Dear Team,\n\nAlert: Sensors exceeded safe levels.\n\n${emailContent}\n\nTube Number: 39\nAsset Location: ROGC Furnace, 4th Pass\n\n\n.
        Best Regards,  
        **XYMA Analytics Team**  
        📧 alert@xyma.in  
        📞 +91 9360565362  
        `,
        };
        
      transporter.sendMail(mailOptions, async (error, info) => {
        if (error) {
          console.error("Error sending email:", error);
        } else {
          console.log("Alert email sent:", info.response);

          try {
            // Update database with last sent time for each sensor
            await Promise.all(
              exceededSensors.map(sensor =>
                AlertSystem.updateOne(
                  { sensor: sensor.name },
                  { lastSent: currentTime},  // Ensure it's a valid timestamp
                  { upsert: true }
                )
              )
            );
            console.log("Sensor alert timestamps updated successfully.");
          } catch (dbError) {
            console.error("Error updating alert timestamps:", dbError.message || dbError);
          }
        }
      });

    } catch (emailError) {
      console.error("Error processing email alerts:", emailError);
    }
      
  } catch (error) {
    return res
      .status(401)
      .json({ message: "Token verification failed", error: error.message });
  }
};

export const InsetLimit = async (req, res) => {
  try {
    const { id, Minvalue, MaxValue } = req.body;
    const time = new Date();
    const existingData = await InsertLimit.findOne({ Id: "0001" });
    if (existingData) {
      let updateData = {};

      if (id === 1) {
        updateData.MinLimit = Minvalue;
      } else if (id === 2) {
        updateData.MaxLimit = MaxValue;
      } else if (id === 3) {
        updateData.MinLimit = Minvalue;
        updateData.MaxLimit = MaxValue;
      }
      const result = await InsertLimit.updateOne(
        { Id: "0001" },
        { $set: updateData }
      );
      if (result.nModified > 0) {
        return res.status(200).json({ message: "Data updated successfully" });
      } else {
        return res.status(200).json({ message: "No changes made to data" });
      }
    } else {
      const data = new InsertLimit({
        Id: "0001",
        MinLimit: Minvalue,
        MaxLimit: MaxValue,
        Time: time,
      });
      await data.save();
      return res.status(200).json({ message: "Data inserted successfully" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error", error: error.message });
  }
};

let Deltavalues = 0;


const intervalofhour=async(onehourbeforedata,formattedCurrentTimeMinusOneHr)=>{
  const formattedIntervalFromDate = onehourbeforedata + ",00:00:00";
  const formattedIntervalToDate = formattedCurrentTimeMinusOneHr + ",23:59:59";
  // console.log("interval option triggered");

  // console.log("from date=",formattedIntervalFromDate)
  // console.log("to date=",formattedIntervalToDate)
    const rilHourlyData = await InsertModel.aggregate([
      {
        $project: {
          Sensor1: {
            $cond: {
              if: { $eq: ["$Sensor1", "N/A"] },
              then: null,
              else: { $toDouble: "$Sensor1" },
            },
          },
          Sensor2: {
            $cond: {
              if: { $eq: ["$Sensor2", "N/A"] },
              then: null,
              else: { $toDouble: "$Sensor2" },
            },
          },
          Sensor3: {
            $cond: {
              if: { $eq: ["$Sensor3", "N/A"] },
              then: null,
              else: { $toDouble: "$Sensor3" },
            },
          },
          originalTime: "$Time",
          hour: {
            $dateToString: {
              format: "%Y-%m-%d,%H:%M:00",
              // date: { $dateFromString: { dateString: "$Time" } },
              date: {
                $subtract: [
                  { $dateFromString: { dateString: "$Time" } },
                  {
                    $multiply: [
                      { $mod: [{ $minute: { $dateFromString: { dateString: "$Time" } } }, 5] },
                      60 * 1000,
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$hour", // Group by hour
          firstDocument: { $first: "$$ROOT" }, // Get the first document in each hour
        },
      },
      {
        $replaceRoot: { newRoot: "$firstDocument" }, // Replace the root with the first document
      },
      {
        $project: {
          _id: 0, // Exclude the _id field
          Sensor1: 1,
          Sensor2: 1,
          Sensor3: 1,
          Time: "$originalTime", // Include hour if needed
        },
      },
    ]);

    if (rilHourlyData.length > 0) {
      const filteredData = rilHourlyData
        .filter((data) => {
          const dbDate = data.Time;
          return (
            dbDate >= formattedIntervalFromDate &&
            dbDate < formattedIntervalToDate
          );
        })
        .sort((a, b) => {
          const [dateA, timeA] = a.Time.split(",");
          const [dateB, timeB] = b.Time.split(",");

          const [yearA, monthA, dayA] = dateA.split("-").map(Number);
          const [hourA, minuteA, secondA] = timeA.split(":").map(Number);

          const [yearB, monthB, dayB] = dateB.split("-").map(Number);
          const [hourB, minuteB, secondB] = timeB.split(":").map(Number);

          const aNumeric =
            yearA * 10000000000 +
            monthA * 100000000 +
            dayA * 1000000 +
            hourA * 10000 +
            minuteA * 100 +
            secondA;
          const bNumeric =
            yearB * 10000000000 +
            monthB * 100000000 +
            dayB * 1000000 +
            hourB * 10000 +
            minuteB * 100 +
            secondB;

          return bNumeric - aNumeric;
        });
      // console.log("filteredData=",filteredData)

      const calculateDifferences = (data) => {
        // Sort data by time (in case it's not already sorted)
        data.sort((a, b) => new Date(a.Time) - new Date(b.Time));

        const differences = [];

        for (let i = 1; i < data.length; i++) {
          const prevEntry = data[i - 1];
          const currentEntry = data[i];
          // console.log("-----1st-----")
          // console.log("prevEntry=",prevEntry)
          // console.log("current entry=",currentEntry)
          // console.log("-----End-----")

          // Calculate the difference in Sensor1 (or any other sensor of interest)
          const sensor1Diff = Math.abs(currentEntry.Sensor1 - prevEntry.Sensor1);
          const sensor2Diff = Math.abs(currentEntry.Sensor2 - prevEntry.Sensor2);
          const sensor3Diff = Math.abs(currentEntry.Sensor3 - prevEntry.Sensor3);

          // Save the result with the time difference and the calculated difference in Sensor1
          differences.push({
            // Time1: prevEntry.Time,
            // Time2: currentEntry.Time,
            Sensor1Difference: sensor1Diff,
            Sensor2Difference:sensor2Diff,
            Sensor3Difference:sensor3Diff
            // Sensor1_1: prevEntry.Sensor1,
            // Sensor1_2: currentEntry.Sensor1
          });
        }
        return differences;
      };
      

      const result = calculateDifferences(filteredData);
      // console.log("data=",result)
      const calculateAverageDifference = (differences) => {
        if (differences.length === 0) return 0; // Handle empty array case
        const sensor_differences = [];

        const total_senosr1 = differences.reduce((sum, entry) => sum + Math.abs(entry.Sensor1Difference), 0);
        const total_senosr2 = differences.reduce((sum, entry) => sum + Math.abs(entry.Sensor2Difference), 0);
        const total_senosr3 = differences.reduce((sum, entry) => sum + Math.abs(entry.Sensor3Difference), 0);

        sensor_differences.push({
          Temp1_R_Delta: Number((total_senosr1 / differences.length).toFixed(2)),
          Temp2_R_Delta: Number((total_senosr2 / differences.length).toFixed(2)),
          Temp3_R_Delta: Number((total_senosr3 / differences.length).toFixed(2)),
          CurrentDelta: differences[differences.length - 1]
        })
        return sensor_differences;
      };
      const averageDifference = calculateAverageDifference(result);
      // console.log("result=",averageDifference);
      Deltavalues = averageDifference;
    } else {
      res.json({ success: false, message: "Data not found" });
    }
}


let previousCount = 0;
export const GetData = async (req, res) => {
  try {
    const data_stage = req.query.limit;
    const currentDateTime = new Date();
    // console.log("limit", data_stage);
    const kolkataTime = currentDateTime.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    });

    const [date, time] = kolkataTime.split(", ");
    const [month, day, year] = date.split("/");
    let [hours, minutes, seconds] = time.split(":");
    if (hours === "24") {
      hours = "00";
    }

    hours = hours.padStart(2, "0");
    minutes = minutes.padStart(2, "0");
    seconds = seconds.padStart(2, "0");

    const formattedCurrentTime = `${year}-${month.padStart(
      2,
      "0"
    )}-${day.padStart(2, "0")},${hours}:${minutes}:${seconds}`;

    const limitData = await InsertLimit.findOne({}, "MinLimit MaxLimit");
    const count = await InsertModel.countDocuments({});

    const activet_data = await InsertModel.findOne({}).sort({ _id: -1 });

    let lastDataTime = null;
    if (activet_data) {
      lastDataTime = activet_data.Time;
    }


    const timeDiffInMinutes =
      (new Date(formattedCurrentTime) - new Date(lastDataTime)) / (1000 * 60);


    //define the before hour diffrent
 
    const a = formattedCurrentTime.split(",")
    const b = a[1].split(":");
    const c = b[0]-1;
    const onehourbeforedata = a[0]+","+c+":"+b[1]+":"+b[2]
    await intervalofhour(onehourbeforedata,formattedCurrentTime);

    // last 1 hr data
    if (data_stage === "1hr") {
      const currentTimeMinusOneHr = new Date(
        currentDateTime.getTime() - 1 * 60 * 60 * 1000
      );

      const kolkataTime2 = currentTimeMinusOneHr.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }

      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");

      const formattedCurrentTimeMinusOneHr = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusOneHr,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });

      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";
        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);

        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);

          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});

        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        });
        previousCount = count;
      }
    }

    // last 3 hr data
    else if (data_stage === "3hr") {
      const currentTimeMinusTwelveHr = new Date(
        currentDateTime.getTime() - 3 * 60 * 60 * 1000
      );
      const kolkataTime2 = currentTimeMinusTwelveHr.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }

      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");

      const formattedCurrentTimeMinusTwelveHr = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

      // console.log(formattedCurrentTimeMinusTwelveHr);

      // console.log("time before 3hr:", formattedCurrentTimeMinusTwelveHr);

      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusTwelveHr,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });

      // console.log("current time=",formattedCurrentTime,"before 3 hrs=",formattedCurrentTimeMinusTwelveHr)
      // console.log("data=",data)
      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";

        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);

        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);

          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});

        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        });
        previousCount = count;
      }
    }
    // last 5 hr data
    else if (data_stage === "5hr") {
      const currentTimeMinusTwelveHr = new Date(
        currentDateTime.getTime() - 5 * 60 * 60 * 1000
      );

      const kolkataTime2 = currentTimeMinusTwelveHr.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }
      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");
      const formattedCurrentTimeMinusTwelveHr = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;
      // console.log("time before 12hr:", formattedCurrentTimeMinusTwelveHr);
      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusTwelveHr,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });
      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";

        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);
        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);

          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});

        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        });
        previousCount = count;
      }
    }
    // last 12 hr data
    else if (data_stage === "12hr") {
      // console.log("yes")
      const currentTimeMinusTwelveHr = new Date(
        currentDateTime.getTime() - 12 * 60 * 60 * 1000
      );
      const kolkataTime2 = currentTimeMinusTwelveHr.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }

      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");

      const formattedCurrentTimeMinusTwelveHr = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

      // console.log("time before 12hr:", formattedCurrentTimeMinusTwelveHr);

      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusTwelveHr,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });
      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";
        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);

        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);
          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});
      





        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        });
        previousCount = count;
      }
    }

    // last 24 hr data
    else if (data_stage === "24hr") {
      const currentTimeMinusTwentyFourHr = new Date(
        currentDateTime.getTime() - 24 * 60 * 60 * 1000
      );

      const kolkataTime2 = currentTimeMinusTwentyFourHr.toLocaleString(
        "en-US",
        {
          timeZone: "Asia/Kolkata",
          hour12: false,
        }
      );

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }

      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");

      const formattedCurrentTimeMinusTwentyFourHr = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

      // console.log("time before 24hr:", formattedCurrentTimeMinusTwentyFourHr);

      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusTwentyFourHr,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });
      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";
        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);

        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);

          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});

        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        });
        previousCount = count;
      }
    }

    // last 7 days data
    else if (data_stage === "7d") {
      const currentTimeMinusSevenDays = new Date(
        currentDateTime.getTime() - 7 * 24 * 60 * 60 * 1000
      );

      const kolkataTime2 = currentTimeMinusSevenDays.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }

      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");

      const formattedCurrentTimeMinusSevenDays = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

      // console.log("time before 7d:", formattedCurrentTimeMinusSevenDays);
      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusSevenDays,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });
      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";
        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);

        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);

          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});

        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues
        });
        previousCount = count;
      }
    }

    // last 30 days data
    else if (data_stage === "30d") {
      const currentTimeMinusThirtyDays = new Date(
        currentDateTime.getTime() - 30 * 24 * 60 * 60 * 1000
      );

      const kolkataTime2 = currentTimeMinusThirtyDays.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      const [date2, time2] = kolkataTime2.split(", ");
      const [month2, day2, year2] = date2.split("/");
      let [hours2, minutes2, seconds2] = time2.split(":");

      if (hours2 === "24") {
        hours2 = "00";
      }

      hours2 = hours2.padStart(2, "0");
      minutes2 = minutes2.padStart(2, "0");
      seconds2 = seconds2.padStart(2, "0");

      const formattedCurrentTimeMinusThirtyDays = `${year2}-${month2.padStart(
        2,
        "0"
      )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

      // console.log("time before 30d:", formattedCurrentTimeMinusThirtyDays);

      const data = await InsertModel.find({
        Time: {
          $gte: formattedCurrentTimeMinusThirtyDays,
          $lte: formattedCurrentTime,
        },
      }).sort({ _id: -1 });
      if (data.length > 0) {
        const activityStatus = timeDiffInMinutes > 20 ? "inactive" : "active";
        const sensor1Data = data.map((item) => item.Sensor1);
        const sensor2Data = data.map((item) => item.Sensor2);
        const sensor3Data = data.map((item) => item.Sensor3);
        const sensor4Data = data.map((item) => item.Sensor4);
        const TimestampData = data.map((item) => item.Time);

        const processSensorData = (sensorData) => {
          const validData = sensorData
            .map((item) => parseFloat(item))
            .filter((item) => !isNaN(item));

          if (validData.length === 0) {
            return {
              maxValue: null,
              minValue: null,
              maxIndex: -1,
              minIndex: -1,
            };
          }

          const maxValue = Math.max(...validData);
          const minValue = Math.min(...validData);

          const maxIndex = sensorData.indexOf(maxValue.toString());
          const minIndex = sensorData.indexOf(minValue.toString());
          return {
            maxValue,
            minValue,
            maxIndex,
            minIndex,
          };
        };
        // Extract and process each sensor's data
        const sensors = ["Sensor1", "Sensor2", "Sensor3", "Sensor4"];
        const sensorStats = sensors.reduce((result, sensor) => {
          const sensorData = data.map((item) => item[sensor]);
          result[sensor] = processSensorData(sensorData);
          return result;
        }, {});

        const response = {
          Sensor1: sensor1Data,
          Sensor2: sensor2Data,
          Sensor3: sensor3Data,
          Sensor4: sensor4Data,
          sensorStats,
          Timestamp: TimestampData,
          activityStatus,
          LimitData: limitData,
          value: activet_data,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
          Delta:Deltavalues

        });
        previousCount = count;
      }
    }
  } catch (error) {
    console.error("Error with fetching data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// reports api
export const getRilReport = async (req, res) => {
  try {
    // console.log('reports api triggered');
    const {
      // projectName,
      fromDate,
      toDate,
      count,
    } = req.query;

    // console.log("req query", req.query);

    // date picker
    if (fromDate && toDate) {
      // console.log("date picker triggered");
      const formattedFromDate = fromDate + ",00:00:00";
      const formattedToDate = toDate + ",23:59:59";

      const data = await InsertModel.find({
        Time: {
          $gte: formattedFromDate,
          $lte: formattedToDate,
        },
      })
        .sort({ _id: -1 })
        .select({
          _id: 0,
          __v: 0,
          Id: 0,
          Sensor4: 0,
        });

      if (data.length > 0) {
        res.status(200).json(data);
      } else if (data.length === 0) {
        res.status(200).json([]);
      }
    }
    // countwise option
    else if (count) {
      // console.log("count option triggered");
      const data = await InsertModel.find({})
        .limit(count)
        .sort({ _id: -1 })
        .select({
          _id: 0,
          __v: 0,
          Id: 0,
          Sensor4: 0,
        });
      if (data.length > 0) {
        res.status(200).json(data);
      } else if (data.length === 0) {
        res.status(200).json([]);
      }
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error });
  }
};

export const getRilAverageReport = async (req, res) => {
  try {
    const {
      // projectName,
      avgFromDate,
      avgToDate,
      averageOption,
      intervalFromDate,
      intervalToDate,
      intervalOption,
    } = req.query;

    // console.log("req query", req.query);

    // const ID = "XY001";

    // average option
    if (avgFromDate && avgToDate) {
      const formattedAvgFromDate = avgFromDate + ",00:00:00";
      const formattedAvgToDate = avgToDate + ",23:59:59";
      // console.log("average option tirggered");

      if (averageOption === "hour") {
        const rilAverageData = await InsertModel.aggregate([
          {
            $project: {
              Sensor1: {
                $cond: {
                  if: { $eq: ["$Sensor1", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor1" },
                },
              },
              Sensor2: {
                $cond: {
                  if: { $eq: ["$Sensor2", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor2" },
                },
              },
              Sensor3: {
                $cond: {
                  if: { $eq: ["$Sensor3", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor3" },
                },
              },

              hour: {
                $dateToString: {
                  format: "%Y-%m-%d,%H:00:00",
                  date: { $dateFromString: { dateString: "$Time" } },
                },
              },
            },
          },
          {
            $group: {
              _id: "$hour",
              avgS1: { $avg: "$Sensor1" },
              avgS2: { $avg: "$Sensor2" },
              avgS3: { $avg: "$Sensor3" },
            },
          },
          {
            $project: {
              _id: 0,
              dateRange: {
                $concat: [
                  "$_id",
                  " to ",
                  {
                    $dateToString: {
                      format: "%Y-%m-%d,%H:00:00",
                      date: {
                        $dateAdd: {
                          startDate: {
                            $dateFromString: { dateString: "$_id" },
                          },
                          unit: "hour",
                          amount: 1,
                        },
                      },
                    },
                  },
                ],
              },
              avgS1: 1,
              avgS2: 1,
              avgS3: 1,
            },
          },
          {
            $sort: { dateRange: -1 },
          },
        ]);

        if (rilAverageData.length > 0) {
          const filteredData = rilAverageData
            .filter((data) => {
              const dbDate = data.dateRange.split(" to ")[0];
              return (
                dbDate >= formattedAvgFromDate && dbDate < formattedAvgToDate
              );
            })
            .map((data) => {
              return {
                ...data,
                avgS1:
                  data.avgS1 !== null
                    ? parseFloat(data.avgS1).toFixed(1)
                    : "N/A",
                avgS2:
                  data.avgS2 !== null
                    ? parseFloat(data.avgS2).toFixed(1)
                    : "N/A",
                avgS3:
                  data.avgS3 !== null
                    ? parseFloat(data.avgS3).toFixed(1)
                    : "N/A",
              };
            });

          res.status(200).json({ data: filteredData });
        } else {
          res.status(200).json([]);
        }
      } else if (averageOption === "day") {
        const rilAverageData = await InsertModel.aggregate([
          {
            $project: {
              Sensor1: {
                $cond: {
                  if: { $eq: ["$Sensor1", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor1" },
                },
              },
              Sensor2: {
                $cond: {
                  if: { $eq: ["$Sensor2", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor2" },
                },
              },
              Sensor3: {
                $cond: {
                  if: { $eq: ["$Sensor3", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor3" },
                },
              },
              day: {
                $dateToString: {
                  format: "%Y-%m-%d,00:00:00",
                  date: { $dateFromString: { dateString: "$Time" } },
                },
              },
            },
          },
          {
            $group: {
              _id: "$day",
              avgS1: { $avg: "$Sensor1" },
              avgS2: { $avg: "$Sensor2" },
              avgS3: { $avg: "$Sensor3" },
            },
          },
          {
            $project: {
              _id: 0,
              dateRange: {
                $concat: [
                  "$_id",
                  " to ",
                  {
                    $dateToString: {
                      format: "%Y-%m-%d,00:00:00",
                      date: {
                        $dateAdd: {
                          startDate: {
                            $dateFromString: { dateString: "$_id" },
                          },
                          unit: "day",
                          amount: 1,
                        },
                      },
                    },
                  },
                ],
              },
              avgS1: 1,
              avgS2: 1,
              avgS3: 1,
            },
          },
          {
            $sort: { dateRange: -1 },
          },
        ]);

        if (rilAverageData.length > 0) {
          const filteredData = rilAverageData
            .filter((data) => {
              const dbDate = data.dateRange.split(" to ")[0];
              return (
                dbDate >= formattedAvgFromDate && dbDate < formattedAvgToDate
              );
            })
            .map((data) => {
              return {
                ...data,
                avgS1:
                  data.avgS1 !== null
                    ? parseFloat(data.avgS1).toFixed(1)
                    : "N/A",
                avgS2:
                  data.avgS2 !== null
                    ? parseFloat(data.avgS2).toFixed(1)
                    : "N/A",
                avgS3:
                  data.avgS3 !== null
                    ? parseFloat(data.avgS3).toFixed(1)
                    : "N/A",
              };
            });

          res.status(200).json({ data: filteredData });
        } else {
          res.status(200).json([]);
        }
      }
    }
    // interval option
    else if (intervalFromDate && intervalToDate) {
      const formattedIntervalFromDate = intervalFromDate + ",00:00:00";
      const formattedIntervalToDate = intervalToDate + ",23:59:59";

      // console.log("interval option triggered");
      if (intervalOption === "hour") {
        const rilHourlyData = await InsertModel.aggregate([
          {
            $project: {
              Sensor1: {
                $cond: {
                  if: { $eq: ["$Sensor1", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor1" },
                },
              },
              Sensor2: {
                $cond: {
                  if: { $eq: ["$Sensor2", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor2" },
                },
              },
              Sensor3: {
                $cond: {
                  if: { $eq: ["$Sensor3", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor3" },
                },
              },
              originalTime: "$Time",
              hour: {
                $dateToString: {
                  format: "%Y-%m-%d,%H:00:00",
                  date: { $dateFromString: { dateString: "$Time" } },
                },
              },
            },
          },
          {
            $group: {
              _id: "$hour", // Group by hour
              firstDocument: { $first: "$$ROOT" }, // Get the first document in each hour
            },
          },
          {
            $replaceRoot: { newRoot: "$firstDocument" }, // Replace the root with the first document
          },
          {
            $project: {
              _id: 0, // Exclude the _id field
              Sensor1: 1,
              Sensor2: 1,
              Sensor3: 1,
              Time: "$originalTime", // Include hour if needed
            },
          },
        ]);

        if (rilHourlyData.length > 0) {
          const filteredData = rilHourlyData
            .filter((data) => {
              const dbDate = data.Time;
              return (
                dbDate >= formattedIntervalFromDate &&
                dbDate < formattedIntervalToDate
              );
            })
            .sort((a, b) => {
              const [dateA, timeA] = a.Time.split(",");
              const [dateB, timeB] = b.Time.split(",");

              const [yearA, monthA, dayA] = dateA.split("-").map(Number);
              const [hourA, minuteA, secondA] = timeA.split(":").map(Number);

              const [yearB, monthB, dayB] = dateB.split("-").map(Number);
              const [hourB, minuteB, secondB] = timeB.split(":").map(Number);

              const aNumeric =
                yearA * 10000000000 +
                monthA * 100000000 +
                dayA * 1000000 +
                hourA * 10000 +
                minuteA * 100 +
                secondA;
              const bNumeric =
                yearB * 10000000000 +
                monthB * 100000000 +
                dayB * 1000000 +
                hourB * 10000 +
                minuteB * 100 +
                secondB;

              return bNumeric - aNumeric;
            });

          res.json({ success: true, data: filteredData });
        } else {
          res.json({ success: false, message: "Data not found" });
        }
      } else if (intervalOption === "day") {
        const rilHourlyData = await InsertModel.aggregate([
          {
            $project: {
              Sensor1: {
                $cond: {
                  if: { $eq: ["$Sensor1", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor1" },
                },
              },
              Sensor2: {
                $cond: {
                  if: { $eq: ["$Sensor2", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor2" },
                },
              },
              Sensor3: {
                $cond: {
                  if: { $eq: ["$Sensor3", "N/A"] },
                  then: null,
                  else: { $toDouble: "$Sensor3" },
                },
              },
              originalTime: "$Time",
              day: {
                $dateToString: {
                  format: "%Y-%m-%d,00:00:00",
                  date: { $dateFromString: { dateString: "$Time" } },
                },
              },
            },
          },
          {
            $group: {
              _id: "$day",
              firstDocument: { $first: "$$ROOT" },
            },
          },
          {
            $replaceRoot: { newRoot: "$firstDocument" },
          },
          {
            $project: {
              _id: 0, // Exclude the _id field
              Sensor1: 1,
              Sensor2: 1,
              Sensor3: 1,
              Time: "$originalTime", // Include hour if needed
            },
          },
        ]);

        if (rilHourlyData.length > 0) {
          const filteredData = rilHourlyData
            .filter((data) => {
              const dbDate = data.Time;
              return (
                dbDate >= formattedIntervalFromDate &&
                dbDate < formattedIntervalToDate
              );
            })
            .sort((a, b) => {
              const [dateA, timeA] = a.Time.split(",");
              const [dateB, timeB] = b.Time.split(",");

              const [yearA, monthA, dayA] = dateA.split("-").map(Number);
              const [hourA, minuteA, secondA] = timeA.split(":").map(Number);

              const [yearB, monthB, dayB] = dateB.split("-").map(Number);
              const [hourB, minuteB, secondB] = timeB.split(":").map(Number);

              const aNumeric =
                yearA * 10000000000 +
                monthA * 100000000 +
                dayA * 1000000 +
                hourA * 10000 +
                minuteA * 100 +
                secondA;
              const bNumeric =
                yearB * 10000000000 +
                monthB * 100000000 +
                dayB * 1000000 +
                hourB * 10000 +
                minuteB * 100 +
                secondB;

              return bNumeric - aNumeric;
            });

          res.json({ success: true, data: filteredData });
        } else {
          res.json({ success: false, message: "Data not found" });
        }
      }
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error });
  }
};



const width = 800;
const height = 400;
let sensor1Data = [];
let sensor2Data = [];
let sensor3Data = [];
let TimestampData = [];

const generateChart = async () => {

const today5PM = moment().set({ hour: 17, minute: 0, second: 0 }).format("YYYY-MM-DD,HH:mm:ss");
const yesterday5PM = moment().subtract(1, "day").set({ hour: 17, minute: 0, second: 0 }).format("YYYY-MM-DD,HH:mm:ss");

  const data = await InsertModel.find({
    Time: {
      $gte: yesterday5PM,
      $lte: today5PM,
    },
  }).sort({ _id: -1 });

// console.log("response data=",data)
 

 if (data.length > 0) {
  sensor1Data = data.map((item) => item.Sensor1);
  sensor2Data = data.map((item) => item.Sensor2);
  sensor3Data = data.map((item) => item.Sensor3);
  TimestampData = data.map((item) => item.Time);

  }else{
    console.log("No Data there at the day")
  
  }


  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
  const configuration = {
    type: "line",
    data: {
      labels: TimestampData.reverse(),
      datasets: [
        {
          label: "Sensor1",
          data: sensor1Data.reverse(),
          borderColor: "#04f5b7",
          backgroundColor: "rgba(76, 175, 80, 0.2)",
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 2,
          tension: 0.2,
          borderWidth: 3,
        },
        {
          label: "Sensor2",
          data: sensor2Data.reverse(),
          borderColor: "#d77806",
          backgroundColor: "rgba(76, 175, 80, 0.2)",
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 2,
          tension: 0.2,
          borderWidth: 3,
        },
        {
          label: "Sensor3",
          data: sensor3Data.reverse(),
          borderColor: "#cedb02",
          backgroundColor: "rgba(76, 175, 80, 0.2)",
           fill: false,
          pointRadius: 0,
          pointHoverRadius: 2,
          tension: 0.2,
          borderWidth: 3,
        },
      ],
    },
    
  };
  return await chartJSNodeCanvas.renderToBuffer(configuration);
};

let tableData=[];
const hour_interval =async()=>{
  const rilHourlyData = await InsertModel.aggregate([
    {
      $project: {
        Sensor1: {
          $cond: {
            if: { $eq: ["$Sensor1", "N/A"] },
            then: null,
            else: { $toDouble: "$Sensor1" },
          },
        },
        Sensor2: {
          $cond: {
            if: { $eq: ["$Sensor2", "N/A"] },
            then: null,
            else: { $toDouble: "$Sensor2" },
          },
        },
        Sensor3: {
          $cond: {
            if: { $eq: ["$Sensor3", "N/A"] },
            then: null,
            else: { $toDouble: "$Sensor3" },
          },
        },
        originalTime: "$Time",
        hour: {
          $dateToString: {
            format: "%Y-%m-%d,%H:00:00",
            date: { $dateFromString: { dateString: "$Time" } },
          },
        },
      },
    },
    {
      $group: {
        _id: "$hour", // Group by hour
        firstDocument: { $first: "$$ROOT" }, // Get the first document in each hour
      },
    },
    {
      $replaceRoot: { newRoot: "$firstDocument" }, // Replace the root with the first document
    },
    {
      $project: {
        _id: 0, // Exclude the _id field
        Sensor1: 1,
        Sensor2: 1,
        Sensor3: 1,
        Time: "$originalTime", // Include hour if needed
      },
    },
  ]);

  if (rilHourlyData.length > 0) {
    tableData = rilHourlyData
      .filter((data) => {
        const dbDate = data.Time;
        return (
          dbDate >= moment().subtract(1, "day").set({ hour: 17, minute: 0, second: 0 }).format("YYYY-MM-DD,HH:mm:ss") &&
          dbDate < moment().set({ hour: 17, minute: 0, second: 0 }).format("YYYY-MM-DD,HH:mm:ss")
        );
      })
      .sort((a, b) => {
        const [dateA, timeA] = a.Time.split(",");
        const [dateB, timeB] = b.Time.split(",");

        const [yearA, monthA, dayA] = dateA.split("-").map(Number);
        const [hourA, minuteA, secondA] = timeA.split(":").map(Number);

        const [yearB, monthB, dayB] = dateB.split("-").map(Number);
        const [hourB, minuteB, secondB] = timeB.split(":").map(Number);

        const aNumeric =
          yearA * 10000000000 +
          monthA * 100000000 +
          dayA * 1000000 +
          hourA * 10000 +
          minuteA * 100 +
          secondA;
        const bNumeric =
          yearB * 10000000000 +
          monthB * 100000000 +
          dayB * 1000000 +
          hourB * 10000 +
          minuteB * 100 +
          secondB;
        return bNumeric - aNumeric;
      });
  } else {
    console.log("Data not Found")
    tableData = [];
    res.json({ success: false, message: "Data not found" });
  }
}

const generatePDF = async () => {
  return new Promise(async (resolve, reject) => {
    const today5PM = moment().set({ hour: 17, minute: 0, second: 0 }).format("YYYY-MM-DD,HH:mm:ss");
    const yesterday5PM = moment().subtract(1, "day").set({ hour: 17, minute: 0, second: 0 }).format("YYYY-MM-DD,HH:mm:ss");

    const doc = new PDFDocument({ margin: 50 });
    const bufferStream = new streamBuffers.WritableStreamBuffer();
    doc.pipe(bufferStream);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // **Cover Page**
    const logoPath = path.join(__dirname, "../Assets/xyma_blue.png");
    const coverPath = path.join(__dirname, "../Assets/pdfcover.png");
    const disclaimer = path.join(__dirname, "../Assets/disclaimerPage.jpg");
    const pipemodel = path.join(__dirname, "../Assets/rill.jpg");

    if (fs.existsSync(coverPath)) {
      doc.image(coverPath, 0, 0, { width: 620, height: 800 });
    }

 
    doc.addPage();
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 500, 30, { width: 80, height: 50 });
      doc.moveDown(2); // Add space after the logo
    }
    
    // **Title**
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#f18e00").text("Daily Sensor Report", { align: "center" });
    doc.moveDown(2);
  // **Ensure text starts after the chart (Fixing Overlap)**


  // **Company Description**
  doc.font("Helvetica").fontSize(12).fillColor("#333").text(
    "utmaps XYMA Manufactures unique ultrasonic waveguide-based sensors to address the critical need of industries in High-Temperature applications.Our Sensors are Enhanced with industrial IoT and Physics-based soft sensing to enhance industrial automation.",
    { align: "justify" }
  );
  doc.moveDown(2);
 // Define positions
    const imageX = 50; // Left margin for the image
    const textStartX = 300; // Right side text alignment
    const tableStartX = 300; // Table starts further right
    const rowheight = 20;
    const columnWidths = [40, 80, 160]; // Widths for S.No, Sensor, Limit Range

    const sectionStartY = doc.y; // Keep track of starting Y position
    if (fs.existsSync(pipemodel)) {
      doc.image(pipemodel, imageX, sectionStartY, { width: 200, height: 300 });
    }

    // **Right-Side Sensor Information**
    const textGap = 20; // Spacing between text lines

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text("Sensor Id:", textStartX, sectionStartY)
      .font("Helvetica").text(" XY001", textStartX + 80, sectionStartY);

    doc.font("Helvetica-Bold").text("Plant:", textStartX, sectionStartY + textGap)
      .font("Helvetica").text(" RIL C2, Jamnagar", textStartX + 80, sectionStartY + textGap);

    doc.font("Helvetica-Bold").text("Tube No:", textStartX, sectionStartY + 2 * textGap)
      .font("Helvetica").text("39", textStartX + 81, sectionStartY + 2 * textGap);

  doc.font("Helvetica-Bold").text("Asset:", { continued: true })
    .font("Helvetica").text(" ROGC Furnace", { underline: false });

    doc.font("Helvetica-Bold").text("Sensor Location:", { continued: true })
    .font("Helvetica").text(" 4th Pass,last 5 meter", { underline: false });
    doc.moveDown(2);
    const chartImage = await generateChart();
    doc.image(chartImage, 50, doc.y, { width: 500, height: 250 });
    doc.moveDown(20); 

    doc.font("Helvetica").text(
      `The table below presents hourly interval data recorded from ${yesterday5PM}, to ${today5PM}. This dataset provides valuable insights into sensor performance over time, enabling trend analysis and anomaly detection. The recorded values help in monitoring system efficiency.`,
      { align: "justify" }
    );

     doc.moveDown(2); 
     
    await hour_interval(); 

    // **Start Table**
    const startX = 50;
    let yPosition = doc.y;
    const rowHeight = 20;
    const colWidths = [50, 100, 100, 100, 150];
    const pageHeight = 750;

    // **Table Header**
    doc.fillColor("#FFF")
      .rect(startX, yPosition, colWidths.reduce((a, b) => a + b), rowHeight)
      .fill("#f18e00");

    doc.fillColor("#FFF").fontSize(12)
      .text("S.No", startX + 10, yPosition + 10)
      .text("Sensor1", startX + colWidths[0] + 10, yPosition + 10)
      .text("Sensor2", startX + colWidths[0] + colWidths[1] + 10, yPosition + 10)
      .text("Sensor3", startX + colWidths[0] + colWidths[1] + colWidths[2] + 10, yPosition + 10)
      .text("Time", startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 10, yPosition + 10);

    yPosition += rowHeight;

    // **Table Data**
    tableData.forEach((row, index) => {
      if (yPosition + rowHeight > pageHeight) {
        doc.addPage();
        yPosition = 50;
      }
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 500, 30, { width: 80, height: 50 });
      }

      doc.fillColor(index % 2 === 0 ? "#F0F0F0" : "#FFF")
        .rect(startX, yPosition, colWidths.reduce((a, b) => a + b), rowHeight)
        .fill();

      doc.fillColor("#333").fontSize(10)
        .text(index + 1, startX + 10, yPosition + 10)
        .text(row.Sensor1?.toString() || "N/A", startX + colWidths[0] + 10, yPosition + 10)
        .text(row.Sensor2?.toString() || "N/A", startX + colWidths[0] + colWidths[1] + 10, yPosition + 10)
        .text(row.Sensor3?.toString() || "N/A", startX + colWidths[0] + colWidths[1] + colWidths[2] + 10, yPosition + 10)
        .text(row.Time || "N/A", startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 10, yPosition + 10);

      yPosition += rowHeight;
    });
    doc.addPage(); 

    if (fs.existsSync(disclaimer)) {
      doc.image(disclaimer, 0, 0, { width: 595, height: 842 }); // Full A4 size
  }
    doc.end();
    bufferStream.on("finish", () => resolve(bufferStream.getContents()));
    bufferStream.on("error", reject);
  });
};



// Send email with PDF attachment
const sendEmail = async () => {
  const allUsers = await loginModel.find({}, "UserName");
  const userMailIds = allUsers.map((user) => user.UserName).join(",");
  const pdfBuffer = await generatePDF();
  
  const mailOptions = {
    from: "alert@xyma.in",
    to: userMailIds ? userMailIds : "stephen@xyma.in",
    // to: "stephen@xyma.in",
    subject: "Daily Sensor Report - Summary & Insights",
    text: `Dear User,


Please find attached the latest daily sensor report, which includes real-time sensor data, performance metrics, and key insights. This report provides a summary of temperature readings and any anomalies detected in the system.

If you have any questions or require further analysis, feel free to reach out.

Best Regards,  
XYMA Analytics Team`,
    attachments: [{ filename: "daily_report.pdf", content: pdfBuffer }],
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email: ", error);
    } else {
      console.log("Email sent successfully: ", info.response);
    }
  });
};


// API route to trigger report manually
export const AutoReport = async (req, res) => {
  try {
    await sendEmail();
    res.status(200).json({ message: "Daily report sent successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send report." });
  }
};

export const TestData = async(req, res)=>{
  try {
    console.log("Running intervalofhour() every hour..=======.");
    const currentDateTime = new Date();
    const currentTimeMinusOneHr = new Date(
      currentDateTime.getTime() - 1 * 60 * 60 * 1000
    );
    const kolkataTime2 = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // 24-hour format
    }).format(currentDateTime);

    const [date2, time2] = kolkataTime2.split(", ");
    const [month2, day2, year2] = date2.split("/");
    let [hours2, minutes2, seconds2] = time2.split(":");

    if (hours2 === "24") {
      hours2 = "00";
    }
  
    hours2 = hours2.padStart(2, "0");
    minutes2 = minutes2.padStart(2, "0");
    seconds2 = seconds2.padStart(2, "0");
  
    const formattedCurrentTimeMinusOneHr = `${year2}-${month2.padStart(
      2,
      "0"
    )}-${day2.padStart(2, "0")},${hours2}:${minutes2}:${seconds2}`;

    const a = formattedCurrentTimeMinusOneHr.split(",")
    const b = a[1].split(":");
    const c = b[0]-1;
    const onehourbeforedata = a[0]+","+c+":"+b[1]+":"+b[2]


    console.log("fromdatesss=",onehourbeforedata)
    console.log("todate=",formattedCurrentTimeMinusOneHr)
    
    await intervalofhour(onehourbeforedata,formattedCurrentTimeMinusOneHr);
  } catch (error) {
    console.error("Error in hourly task:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export const MailAlert = async (req, res) => {
  const { sensorid, Value } = req.body;

  try {
    if (!sensorid || !Value) {
      return res.status(400).json({ message: "All fields are required" });
    }
    let updateField = {};
    if (sensorid === "sensor1") {
      updateField.Sensor1 = Value;
    } else if (sensorid === "sensor2") {
      updateField.Sensor2 = Value;
    } else if (sensorid === "sensor3") {
      updateField.Sensor3 = Value;
    } else {
      return res.status(400).json({ message: "Invalid sensor ID" });
    }
    const updatedSensor = await EmailAlert.findOneAndUpdate(
      { SensorId: "sensor_data" }, // Single document to hold all sensor data
      { $set: updateField },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Sensor value updated successfully",
      data: updatedSensor,
    });
  } catch (error) {
    console.error("Error in storing mail:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// Schedule report at 17:00 (5:00 PM) daily
cron.schedule("0 17 * * *",async () => {
  try {
    console.log("Generating and sending daily report...");
    await sendEmail();
  } catch (error) {
    console.error("Error sending daily report:", error);
  }
});



