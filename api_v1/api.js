import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import axios from "axios";
import loginModel from "../Models/Login.js";
import InsertModel from "../Models/InsertModel.js";
import InsertLimit from "../Models/Inser_Limit.js";

import AuthModel from "../Models/Insert_Auth.js";

// http://localhost:4000/backend/hindalcoSignup?Username=[username]&Password=[password]
export const signup = (req, res) => {
  const { Username, Password } = req.query;
  bcrypt
    .hash(Password, 10)
    .then((hash) => {
      loginModel
        .create({ Username, Password: hash })
        .then((info) => res.json(info))
        .catch((err) => res.json(err));
    })
    .catch((error) => console.log(error));
};

// final
export const login = (req, res) => {
  const { Username, Password } = req.body;
  loginModel
    .findOne({ Username })
    .then((user) => {
      if (user) {
        bcrypt.compare(Password, user.Password, (err, response) => {
          if (response) {
            const redirectUrl = "/";
            const token = jwt.sign(
              { Username: user.Username },
              "jwt-secret-key-123"
            );
            res.json({ token, redirectUrl });
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
    // const formattedTime = new Date(Time);

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
    return res
      .status(200)
      .json({ message: "Data inserted successfully", data: newData });
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

    // console.log("current time", formattedCurrentTime);

    const limitData = await InsertLimit.findOne({}, "MinLimit MaxLimit");
    const count = await InsertModel.countDocuments({});

    const activet_data = await InsertModel.findOne({}).sort({ _id: -1 });

    let lastDataTime = null;
    if (activet_data) {
      lastDataTime = activet_data.Time;
    }

    const timeDiffInMinutes =
      (new Date(formattedCurrentTime) - new Date(lastDataTime)) / (1000 * 60);

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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
        };

        res.status(200).json(response);
        previousCount = count;
      } else {
        res.status(201).json({
          error: "No Data Found",
          value: activet_data,
          LimitData: limitData,
          terminal_status: count > previousCount,
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
