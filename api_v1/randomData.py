import requests
import json
import time
from datetime import datetime
import random

# API endpoints
url = "http://localhost:4000/backend/InsertData"

# Authorization token
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InN0ZXBoZW4iLCJpYXQiOjE3MzYzNDI3MTl9.1UdvBNgSAQV2RZsuq5N9xUJ9A3aIOQmq8EPzcJdPAs8"

# Headers with Authorization token
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}

# Infinite loop to send data every second
while True:
    # Generate current UTC time in the required format
    current_time = datetime.now().strftime("%Y-%m-%d,%H:%M:%S")


    # Random sensor values
    data = {
        "Id": "XY001",
        "Sensor1": random.randint(1000, 1050),
        "Sensor2": random.randint(1000, 1050),
        "Sensor3": random.randint(600, 1050),
        "Sensor4": "N/A",
        "Time": current_time,  # Formatted timestamp
    }

    try:
        # Send POST request
        response = requests.post(url, json=data, headers=headers)

        # Print response
        print("Status Code:", response.status_code)
        print("Response:", response.json())

    except Exception as e:
        print("Error:", str(e))

    # Wait for 1 second before sending the next request
    time.sleep(30)
