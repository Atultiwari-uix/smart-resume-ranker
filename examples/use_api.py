import requests

url = "http://localhost:5000/upload"

# Your job description
job_description = "Looking for a software developer skilled in Python, APIs, and backend development."


pdf_path = "resume.pdf"

with open(pdf_path, "rb") as f:
    files = {"pdf": ("resume.pdf", f, "application/pdf")}
    data = {
        "jobDescription": job_description,
        "jobType": "software"
    }

    response = requests.post(url, files=files, data=data)

print("Status:", response.status_code)
print("Response JSON:", response.json())
