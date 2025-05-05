export let currentPage = 1;
export const itemsPerPage = 10;
export const charts = {};

function updateSelect(id, items, defaultOption, labelFn, type) {
    const select = document.getElementById(id);
    if (select && (!select.dataset.type || select.dataset.type === type)) {
        select.innerHTML = `<option value="">${defaultOption}</option>` + 
            items.map(item => `<option value="${item.id}">${labelFn(item)}</option>`).join("");
        if (type) select.dataset.type = type;
    }
}

export function updateFormOptions(classes, students, homework, attendance, sessionalMarks) {
    updateSelect("studentClass", classes, "Select Class", c => c.name);
    updateSelect("studentClassFilter", classes, "All Classes", c => c.name);
    updateSelect("attendanceClass", classes, "Select Class", c => c.name);
    updateSelect("pastAttendanceClass", classes, "Select Class", c => c.name);
    updateSelect("marksClass", classes, "Select Class", c => c.name);
    updateSelect("marksClassFilter", classes, "All Classes", c => c.name);
    updateSelect("homeworkTargetSpecific", classes, "Select Class", c => c.name, "class");
    updateSelect("homeworkTargetSpecific", students, "Select Student", s => s.name, "student");

    const homeworkTarget = document.getElementById("homeworkTarget");
    const homeworkTargetSpecific = document.getElementById("homeworkTargetSpecific");
    if (homeworkTarget && homeworkTargetSpecific) {
        homeworkTarget.removeEventListener("change", handleTargetChange);
        homeworkTarget.addEventListener("change", handleTargetChange);

        function handleTargetChange(e) {
            homeworkTargetSpecific.style.display = e.target.value === "all" ? "none" : "block";
            if (e.target.value === "student") {
                homeworkTargetSpecific.innerHTML = `<option value="">Select Student</option>` + 
                    students.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
                homeworkTargetSpecific.dataset.type = "student";
            } else if (e.target.value === "class") {
                homeworkTargetSpecific.innerHTML = `<option value="">Select Class</option>` + 
                    classes.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
                homeworkTargetSpecific.dataset.type = "class";
            } else {
                homeworkTargetSpecific.innerHTML = `<option value="">Select Target</option>`;
            }
        }
    }
}

export function loadStudents(students, classes, page) {
    currentPage = Math.max(1, page);
    let filtered = students;
    const search = document.getElementById("studentSearchInput")?.value.toLowerCase() || "";
    const classFilter = document.getElementById("studentClassFilter")?.value || "";
    if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search) || s.rollNumber.toLowerCase().includes(search));
    if (classFilter) filtered = filtered.filter(s => s.classId === classFilter);
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);
    const start = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);

    const tbody = document.querySelector("#studentTable tbody");
    if (tbody) {
        tbody.innerHTML = paginated.map(s => `
            <tr>
                <td>${s.name}</td>
                <td>${s.rollNumber}</td>
                <td>${classes.find(c => c.id === s.classId)?.name || "Unknown"}</td>
                <td>
                    <button class="action-btn edit-student-btn" data-id="${s.id}">Edit</button>
                    <button class="action-btn delete-student-btn" data-id="${s.id}">Delete</button>
                </td>
            </tr>
        `).join("");
    }
    document.getElementById("studentPageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("studentPrevPageBtn").disabled = currentPage === 1;
    document.getElementById("studentNextPageBtn").disabled = currentPage === totalPages;
}

export function loadHomework(homework, students, classes, page) {
    currentPage = Math.max(1, page);
    let filtered = homework;
    const search = document.getElementById("homeworkSearchInput")?.value.toLowerCase() || "";
    const statusFilter = document.getElementById("homeworkStatusFilter")?.value || "";
    if (search) filtered = filtered.filter(h => h.title.toLowerCase().includes(search));
    if (statusFilter) filtered = filtered.filter(h => h.status === statusFilter);
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);
    const start = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);

    const tbody = document.querySelector("#homeworkTable tbody");
    if (tbody) {
        tbody.innerHTML = paginated.map(h => `
            <tr>
                <td>${h.title}</td>
                <td>${h.target === "all" ? "All Students" : h.target === "student" ? (students.find(s => s.id === h.targetSpecific)?.name || "Unknown") : (classes.find(c => c.id === h.targetSpecific)?.name || "Unknown")}</td>
                <td>${h.dueDate}</td>
                <td>${h.status}</td>
                <td>${h.fileUrl ? `<a href="${h.fileUrl}" target="_blank" class="action-btn download-btn">Download</a>` : "None"}</td>
                <td>
                    <button class="action-btn edit-homework-btn" data-id="${h.id}">Edit</button>
                    <button class="action-btn delete-homework-btn" data-id="${h.id}">Delete</button>
                </td>
            </tr>
        `).join("");
    }
    document.getElementById("homeworkPageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("homeworkPrevPageBtn").disabled = currentPage === 1;
    document.getElementById("homeworkNextPageBtn").disabled = currentPage === totalPages;
}

export function loadClasses(classes) {
    const tbody = document.querySelector("#classTable tbody");
    if (tbody) {
        tbody.innerHTML = classes.length ? classes.map(c => `
            <tr>
                <td>${c.name}</td>
                <td>
                    <button class="action-btn edit-class-btn" data-id="${c.id}">Edit</button>
                    <button class="action-btn delete-class-btn" data-id="${c.id}">Delete</button>
                </td>
            </tr>
        `).join("") : "<tr><td colspan='2'>No classes found.</td></tr>";
    }
}

export function loadAttendanceStudents(classId, students) {
    const tbody = document.querySelector("#attendanceTable tbody");
    if (tbody) {
        if (!classId) {
            tbody.innerHTML = "<tr><td colspan='3'>Select a class to view students.</td></tr>";
            return;
        }
        const classStudents = students.filter(s => s.classId === classId);
        tbody.innerHTML = classStudents.length ? classStudents.map(s => `
            <tr>
                <td>${s.name}</td>
                <td>${s.rollNumber}</td>
                <td>
                    <select data-student-id="${s.id}">
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                    </select>
                </td>
            </tr>
        `).join("") : "<tr><td colspan='3'>No students found in this class.</td></tr>";
    }
}

export function loadPastAttendance(attendance, students, classes) {
    const date = document.getElementById("pastAttendanceDate")?.value;
    const classId = document.getElementById("pastAttendanceClass")?.value || "";
    const tbody = document.querySelector("#pastAttendanceTable tbody");
    if (tbody) {
        if (!date || !classId) {
            tbody.innerHTML = "<tr><td colspan='3'>Select a date and class to view attendance.</td></tr>";
            return;
        }
        const classStudents = students.filter(s => s.classId === classId);
        const attendanceData = attendance.find(a => a.id === classId)?.[date] || {};
        tbody.innerHTML = classStudents.length ? classStudents.map(s => `
            <tr>
                <td>${s.name}</td>
                <td>${s.rollNumber}</td>
                <td>${attendanceData[s.id] || "Not Recorded"}</td>
            </tr>
        `).join("") : "<tr><td colspan='3'>No students found in this class.</td></tr>";
    }
}

export function loadSessionalMarks(sessionalMarks, students, classes, page) {
    currentPage = Math.max(1, page);
    let filtered = sessionalMarks;
    const search = document.getElementById("marksSearchInput")?.value.toLowerCase() || "";
    const classFilter = document.getElementById("marksClassFilter")?.value || "";
    if (search) filtered = filtered.filter(m => 
        m.subject.toLowerCase().includes(search) || 
        students.find(s => s.id === m.studentId)?.name.toLowerCase().includes(search)
    );
    if (classFilter) filtered = filtered.filter(m => m.classId === classFilter);
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);
    const start = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(start, start + itemsPerPage);

    const tbody = document.querySelector("#marksTable tbody");
    if (tbody) {
        tbody.innerHTML = paginated.map(m => `
            <tr>
                <td>${students.find(s => s.id === m.studentId)?.name || "Unknown"}</td>
                <td>${classes.find(c => c.id === m.classId)?.name || "Unknown"}</td>
                <td>${m.subject}</td>
                <td>${m.examType}</td>
                <td>${m.marks}/${m.maxMarks}</td>
                <td>${m.date}</td>
                <td>
                    <button class="action-btn edit-marks-btn" data-id="${m.id}">Edit</button>
                    <button class="action-btn delete-marks-btn" data-id="${m.id}">Delete</button>
                </td>
            </tr>
        `).join("");
    }
    document.getElementById("marksPageInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("marksPrevPageBtn").disabled = currentPage === 1;
    document.getElementById("marksNextPageBtn").disabled = currentPage === totalPages;
}

export function loadAnalytics(homework, students, sessionalMarks) {
    const ctxIds = ["homeworkCompletionChart", "studentWorkloadChart", "marksDistributionChart"];
    ctxIds.forEach(id => {
        if (charts[id]) charts[id].destroy();
    });

    const pending = homework.filter(h => h.status === "Pending").length;
    const submitted = homework.filter(h => h.status === "Submitted").length;

    charts.homeworkCompletionChart = new Chart(document.getElementById("homeworkCompletionChart"), {
        type: "bar",
        data: {
            labels: ["Pending", "Submitted"],
            datasets: [{ label: "Homework", data: [pending, submitted], backgroundColor: ["#e74c3c", "#2ecc71"] }]
        },
        options: { scales: { y: { beginAtZero: true } } }
    });

    const workload = students.map(s => ({
        name: s.name,
        count: homework.filter(h => h.target === "all" || (h.target === "student" && h.targetSpecific === s.id) || (h.target === "class" && h.targetSpecific === s.classId)).length
    }));

    charts.studentWorkloadChart = new Chart(document.getElementById("studentWorkloadChart"), {
        type: "pie",
        data: {
            labels: workload.map(w => w.name),
            datasets: [{ data: workload.map(w => w.count), backgroundColor: ["#3498db", "#e74c3c", "#f1c40f", "#2ecc71", "#9b59b6"] }]
        }
    });

    const marksBySubject = sessionalMarks.reduce((acc, m) => {
        acc[m.subject] = acc[m.subject] || { total: 0, count: 0 };
        acc[m.subject].total += m.marks / m.maxMarks * 100;
        acc[m.subject].count++;
        return acc;
    }, {});

    charts.marksDistributionChart = new Chart(document.getElementById("marksDistributionChart"), {
        type: "bar",
        data: {
            labels: Object.keys(marksBySubject),
            datasets: [{
                label: "Average Marks %",
                data: Object.values(marksBySubject).map(m => m.count > 0 ? m.total / m.count : 0),
                backgroundColor: "#3498db"
            }]
        },
        options: { scales: { y: { beginAtZero: true, max: 100 } } }
    });
}

export function toggleSection(sectionId) {
    document.querySelectorAll(".data-section, .form-section").forEach(section => {
        section.style.display = section.id === sectionId ? "block" : "none";
    });
}

export function resetForm(formId) {
    document.getElementById(formId).reset();
    const saveBtn = document.getElementById(formId.replace("Form", "Btn"));
    if (saveBtn) {
        delete saveBtn.dataset.mode;
        delete saveBtn.dataset.editId;
    }
}

export function showNotification(message, type = "success") {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.right = "20px";
    notification.style.padding = "10px 20px";
    notification.style.background = type === "success" ? "#2ecc71" : "#e74c3c";
    notification.style.color = "#fff";
    notification.style.borderRadius = "5px";
    notification.style.zIndex = "10000";
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

export function showLoading() {
    document.getElementById("teacherLoading").style.display = "block";
}

export function hideLoading() {
    document.getElementById("teacherLoading").style.display = "none";
}

export function showUploading() {
    document.getElementById("teacherLoading").textContent = "Uploading...";
    document.getElementById("teacherLoading").style.display = "block";
}