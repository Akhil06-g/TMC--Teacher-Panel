import * as Auth from "./auth.js";
import * as DataOps from "./dataOperations.js";
import * as UIOps from "./uiOperations.js";
import { getDatabase, ref, set, onValue, push, remove } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

const database = getDatabase(Auth.app);
const storage = getStorage(Auth.app);

let currentUser = null;
let classes = [];
let students = [];
let homework = [];
let attendance = [];
let sessionalMarks = [];

function initializeTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("teacherThemeSelect").value = theme;
}

function setupMobileMenu() {
    const hamburgerBtn = document.getElementById("teacherHamburgerBtn");
    const sidebar = document.getElementById("teacherSidebar");
    if (hamburgerBtn && sidebar) {
        hamburgerBtn.addEventListener("click", () => {
            sidebar.classList.toggle("active");
            document.body.style.overflow = sidebar.classList.contains("active") ? "hidden" : "auto";
        });
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !hamburgerBtn.contains(e.target) && sidebar.classList.contains("active")) {
                sidebar.classList.remove("active");
                document.body.style.overflow = "auto";
            }
        });
    }
}

function setupRealTimeListeners() {
    const paths = {
        "classes": data => { 
            classes = data || []; 
            UIOps.updateFormOptions(classes, students, homework, attendance, sessionalMarks); 
            UIOps.loadClasses(classes); 
        },
        "students": data => { 
            students = data || []; 
            UIOps.loadStudents(students, classes, 1); 
            UIOps.updateFormOptions(classes, students, homework, attendance, sessionalMarks); 
        },
        "homework": data => { 
            homework = data || []; 
            UIOps.loadHomework(homework, students, classes, 1); 
            UIOps.loadAnalytics(homework, students, sessionalMarks); 
        },
        "attendance": data => { 
            attendance = data || []; 
            UIOps.loadPastAttendance(attendance, students, classes); 
        },
        "sessionalMarks": data => { 
            sessionalMarks = data || []; 
            UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1); 
            UIOps.loadAnalytics(homework, students, sessionalMarks); 
        }
    };
    Object.entries(paths).forEach(([path, callback]) => {
        DataOps.listenToData(`teachers/${currentUser.uid}/${path}`, callback);
    });
}

function loadHomeData() {
    const teacherName = currentUser.email.split("@")[0];
    document.getElementById("teacherName").textContent = teacherName.charAt(0).toUpperCase() + teacherName.slice(1);
    document.getElementById("totalStudents").textContent = students.length;
    document.getElementById("pendingHomework").textContent = homework.filter(h => h.status === "Pending").length;
    document.getElementById("submittedHomework").textContent = homework.filter(h => h.status === "Submitted").length;
    const nextDue = homework.filter(h => h.status === "Pending").sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]?.dueDate || "N/A";
    document.getElementById("nextDueDate").textContent = nextDue;
    const tips = ["Encourage creativity!", "Stay organized!", "Inspire every day!"];
    document.getElementById("dailyTip").textContent = tips[Math.floor(Math.random() * tips.length)];
}

async function saveStudent(name, rollNumber, classId, password) {
    if (!currentUser || !currentUser.uid) {
        UIOps.showNotification("You must be logged in!", "error");
        return;
    }
    if (!classes.length) {
        UIOps.showNotification("Please create a class first!", "error");
        UIOps.toggleSection("manageClassesSection");
        return;
    }
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.saveData(`teachers/${currentUser.uid}/students`, { name, rollNumber, classId, password });
        UIOps.showNotification("Student added successfully!");
    } catch (error) {
        console.error("Error saving student:", error);
        UIOps.showNotification("Error saving student: " + error.message, "error");
    }
}

async function updateStudent(id, name, rollNumber, classId, password) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/students/${id}`, { name, rollNumber, classId, password });
        UIOps.showNotification("Student updated successfully!");
    } catch (error) {
        console.error("Error updating student:", error);
        UIOps.showNotification("Error updating student: " + error.message, "error");
    }
}

async function deleteStudent(id) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.deleteData(`teachers/${currentUser.uid}/students/${id}`);
        UIOps.showNotification("Student deleted successfully!");
    } catch (error) {
        console.error("Error deleting student:", error);
        UIOps.showNotification("Error deleting student: " + error.message, "error");
    }
}

async function saveHomework(data) {
    try {
        await Auth.getFreshToken(currentUser);
        const file = document.getElementById("homeworkFile")?.files[0];
        let fileUrl = "";
        if (file) {
            UIOps.showUploading();
            const fileRef = storageRef(storage, `teachers/${currentUser.uid}/homework/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            fileUrl = await getDownloadURL(fileRef);
        } else {
            UIOps.showLoading();
        }
        await DataOps.saveData(`teachers/${currentUser.uid}/homework`, { ...data, fileUrl, status: "Pending" });
        UIOps.showNotification("Homework assigned successfully!");
    } catch (error) {
        console.error("Error in saveHomework:", error);
        UIOps.showNotification("Error assigning homework: " + error.message, "error");
    } finally {
        UIOps.hideLoading();
    }
}

async function updateHomework(id, data) {
    try {
        await Auth.getFreshToken(currentUser);
        const file = document.getElementById("homeworkFile")?.files[0];
        let fileUrl = data.fileUrl || "";
        if (file) {
            UIOps.showUploading();
            const fileRef = storageRef(storage, `teachers/${currentUser.uid}/homework/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            fileUrl = await getDownloadURL(fileRef);
        } else {
            UIOps.showLoading();
        }
        await DataOps.updateData(`teachers/${currentUser.uid}/homework/${id}`, { ...data, fileUrl, status: "Pending" });
        UIOps.showNotification("Homework updated successfully!");
    } catch (error) {
        console.error("Error in updateHomework:", error);
        UIOps.showNotification("Error updating homework: " + error.message, "error");
    } finally {
        UIOps.hideLoading();
    }
}

async function deleteHomework(id) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.deleteData(`teachers/${currentUser.uid}/homework/${id}`);
        UIOps.showNotification("Homework deleted successfully!");
    } catch (error) {
        console.error("Error deleting homework:", error);
        UIOps.showNotification("Error deleting homework: " + error.message, "error");
    }
}

async function saveAttendance(classId, attendanceData) {
    const date = new Date().toISOString().split("T")[0];
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/attendance/${classId}/${date}`, attendanceData);
        UIOps.showNotification("Attendance saved successfully!");
    } catch (error) {
        console.error("Error saving attendance:", error);
        UIOps.showNotification("Error saving attendance: " + error.message, "error");
    }
}

async function saveSessionalMarks(data) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.saveData(`teachers/${currentUser.uid}/sessionalMarks`, data);
        UIOps.showNotification("Marks assigned successfully!");
    } catch (error) {
        console.error("Error saving marks:", error);
        UIOps.showNotification("Error saving marks: " + error.message, "error");
    }
}

async function updateSessionalMarks(id, data) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/sessionalMarks/${id}`, data);
        UIOps.showNotification("Marks updated successfully!");
    } catch (error) {
        console.error("Error updating marks:", error);
        UIOps.showNotification("Error updating marks: " + error.message, "error");
    }
}

async function deleteSessionalMarks(id) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.deleteData(`teachers/${currentUser.uid}/sessionalMarks/${id}`);
        UIOps.showNotification("Marks deleted successfully!");
    } catch (error) {
        console.error("Error deleting marks:", error);
        UIOps.showNotification("Error deleting marks: " + error.message, "error");
    }
}

async function saveClass(name) {
    if (!currentUser || !currentUser.uid) {
        UIOps.showNotification("You must be logged in to add a class!", "error");
        return;
    }
    const path = `teachers/${currentUser.uid}/classes`;
    try {
        await Auth.getFreshToken(currentUser);
        const classId = await DataOps.saveData(path, { name });
        UIOps.showNotification("Class added successfully!");
    } catch (error) {
        console.error("Error saving class:", error, "Path:", path);
        UIOps.showNotification("Error saving class: " + error.message, "error");
    }
}

async function updateClass(id, name) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/classes/${id}`, { name });
        UIOps.showNotification("Class updated successfully!");
    } catch (error) {
        console.error("Error updating class:", error);
        UIOps.showNotification("Error updating class: " + error.message, "error");
    }
}

async function deleteClass(id) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.deleteData(`teachers/${currentUser.uid}/classes/${id}`);
        UIOps.showNotification("Class deleted successfully!");
    } catch (error) {
        console.error("Error deleting class:", error);
        UIOps.showNotification("Error deleting class: " + error.message, "error");
    }
}

async function initializeProfile(user) {
    if (!user || !user.uid) {
        console.error("Cannot initialize profile: No user provided");
        UIOps.showNotification("Authentication error: No user found", "error");
        return;
    }
    const path = `teachers/${user.uid}/profile`;
    try {
        await Auth.getFreshToken(user);
        await set(ref(database, path), {
            email: user.email,
            notifications: { homework: true, students: true },
            theme: "light"
        });
    } catch (error) {
        console.error("Error initializing profile:", error, "Path:", path);
        UIOps.showNotification("Error initializing profile: " + error.message, "error");
    }
}

function setupEventListeners() {
    // Login
    document.getElementById("teacherLoginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("teacherLoginEmail").value;
        const password = document.getElementById("teacherLoginPassword").value;
        try {
            UIOps.showLoading();
            await Auth.login(email, password);
            document.getElementById("teacherLoginModal").style.display = "none";
            UIOps.showNotification("Login successful!");
        } catch (error) {
            console.error("Login error:", error);
            document.getElementById("teacherLoginError").textContent = error.message;
            document.getElementById("teacherLoginError").style.display = "block";
        } finally {
            UIOps.hideLoading();
        }
    });

    // Register
    document.getElementById("teacherRegisterForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("teacherRegisterEmail").value;
        const password = document.getElementById("teacherRegisterPassword").value;
        const confirmPassword = document.getElementById("teacherRegisterConfirmPassword").value;
        if (password !== confirmPassword) {
            document.getElementById("teacherRegisterError").textContent = "Passwords do not match!";
            document.getElementById("teacherRegisterError").style.display = "block";
            return;
        }
        try {
            UIOps.showLoading();
            await Auth.register(email, password);
            document.getElementById("teacherRegisterModal").style.display = "none";
            UIOps.showNotification("Registration successful!");
        } catch (error) {
            console.error("Registration error:", error);
            document.getElementById("teacherRegisterError").textContent = error.message;
            document.getElementById("teacherRegisterError").style.display = "block";
        } finally {
            UIOps.hideLoading();
        }
    });

    // Modal Switches
    document.getElementById("switchToRegister").addEventListener("click", () => {
        document.getElementById("teacherLoginModal").style.display = "none";
        document.getElementById("teacherRegisterModal").style.display = "flex";
    });
    document.getElementById("switchToLogin").addEventListener("click", () => {
        document.getElementById("teacherRegisterModal").style.display = "none";
        document.getElementById("teacherLoginModal").style.display = "flex";
    });

    // Sidebar Navigation
    document.getElementById("teacherHomeBtn").addEventListener("click", () => {
        UIOps.toggleSection("teacherHomeSection");
        loadHomeData();
    });
    document.getElementById("addStudentBtn").addEventListener("click", () => UIOps.toggleSection("addStudentSection"));
    document.getElementById("studentsListBtn").addEventListener("click", () => UIOps.toggleSection("studentsListSection"));
    document.getElementById("assignHomeworkBtn").addEventListener("click", () => UIOps.toggleSection("assignHomeworkSection"));
    document.getElementById("homeworkStatusBtn").addEventListener("click", () => UIOps.toggleSection("homeworkStatusSection"));
    document.getElementById("attendanceBtn").addEventListener("click", () => {
        UIOps.toggleSection("attendanceSection");
        UIOps.loadAttendanceStudents("", students);
    });
    document.getElementById("sessionalMarksBtn").addEventListener("click", () => {
        UIOps.toggleSection("sessionalMarksSection");
        UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1);
    });
    document.getElementById("teacherAnalyticsBtn").addEventListener("click", () => UIOps.toggleSection("teacherAnalyticsSection"));
    document.getElementById("manageClassesBtn").addEventListener("click", () => UIOps.toggleSection("manageClassesSection"));
    document.getElementById("teacherSettingsBtn").addEventListener("click", () => {
        UIOps.toggleSection("teacherSettingsSection");
        document.getElementById("settingsEmail").value = currentUser.email;
    });
    document.getElementById("teacherLogoutBtn").addEventListener("click", Auth.logout);

    // Add Student Event Listeners
    document.getElementById("addNewStudentBtn").addEventListener("click", () => {
        const studentForm = document.getElementById("studentForm");
        studentForm.style.display = "block";
        studentForm.classList.remove("hidden");
        UIOps.resetForm("studentForm");
        const saveBtn = document.getElementById("saveStudentBtn");
        delete saveBtn.dataset.mode;
        delete saveBtn.dataset.editId;
    });

    document.getElementById("saveStudentBtn").addEventListener("click", async () => {
        const name = document.getElementById("studentName").value;
        const rollNumber = document.getElementById("rollNumber").value;
        const classId = document.getElementById("studentClass").value;
        const password = document.getElementById("studentPassword").value;
        const saveBtn = document.getElementById("saveStudentBtn");
        if (!name || !rollNumber || !classId || !password) {
            UIOps.showNotification("Please fill all fields!", "error");
            return;
        }
        try {
            UIOps.showLoading();
            if (saveBtn.dataset.mode === "edit" && saveBtn.dataset.editId) {
                const id = saveBtn.dataset.editId;
                await updateStudent(id, name, rollNumber, classId, password);
            } else {
                await saveStudent(name, rollNumber, classId, password);
            }
            UIOps.resetForm("studentForm");
            document.getElementById("studentForm").style.display = "none";
            UIOps.toggleSection("studentsListSection");
            delete saveBtn.dataset.mode;
            delete saveBtn.dataset.editId;
        } catch (error) {
            console.error("Error processing student:", error);
            UIOps.showNotification("Error processing student: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    // Manage Homework Event Listeners
    document.getElementById("saveHomeworkBtn").addEventListener("click", async () => {
        const data = {
            title: document.getElementById("homeworkTitle").value,
            description: document.getElementById("homeworkDescription").value,
            dueDate: document.getElementById("homeworkDueDate").value,
            target: document.getElementById("homeworkTarget").value,
            targetSpecific: document.getElementById("homeworkTargetSpecific").value || ""
        };
        if (!data.title || !data.description || !data.dueDate || !data.target) {
            UIOps.showNotification("Please fill all required fields!", "error");
            return;
        }
        if (data.target !== "all" && !data.targetSpecific) {
            UIOps.showNotification("Please select a specific target!", "error");
            return;
        }
        try {
            if (document.getElementById("saveHomeworkBtn").dataset.mode === "edit") {
                const id = document.getElementById("saveHomeworkBtn").dataset.editId;
                await updateHomework(id, data);
            } else {
                await saveHomework(data);
            }
            UIOps.resetForm("homeworkForm");
            UIOps.toggleSection("homeworkStatusSection");
        } catch (error) {
            console.error("Error processing homework:", error);
            UIOps.showNotification("Error processing homework: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    // Manage Sessional Marks Event Listeners
    document.getElementById("marksClass").addEventListener("change", (e) => {
        const classId = e.target.value;
        const studentSelect = document.getElementById("marksStudent");
        studentSelect.innerHTML = `<option value="">Select Student</option>` + 
            students.filter(s => s.classId === classId).map(s => `<option value="${s.id}">${s.name}</option>`).join("");
    });

    document.getElementById("saveMarksBtn").addEventListener("click", async () => {
        const data = {
            studentId: document.getElementById("marksStudent").value,
            classId: document.getElementById("marksClass").value,
            subject: document.getElementById("marksSubject").value,
            examType: document.getElementById("marksExamType").value,
            marks: parseInt(document.getElementById("marksObtained").value),
            maxMarks: parseInt(document.getElementById("marksMax").value),
            date: document.getElementById("marksDate").value
        };
        if (!data.studentId || !data.classId || !data.subject || !data.examType || isNaN(data.marks) || isNaN(data.maxMarks) || !data.date) {
            UIOps.showNotification("Please fill all fields!", "error");
            return;
        }
        if (data.marks > data.maxMarks) {
            UIOps.showNotification("Marks cannot exceed maximum marks!", "error");
            return;
        }
        try {
            UIOps.showLoading();
            const saveBtn = document.getElementById("saveMarksBtn");
            if (saveBtn.dataset.mode === "edit" && saveBtn.dataset.editId) {
                await updateSessionalMarks(saveBtn.dataset.editId, data);
            } else {
                await saveSessionalMarks(data);
            }
            UIOps.resetForm("sessionalMarksForm");
            UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1);
            delete saveBtn.dataset.mode;
            delete saveBtn.dataset.editId;
        } catch (error) {
            console.error("Error processing marks:", error);
            UIOps.showNotification("Error processing marks: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    // Manage Classes Event Listeners
    document.getElementById("addNewClassBtn").addEventListener("click", () => {
        const classForm = document.getElementById("classForm");
        classForm.style.display = "block";
        classForm.classList.remove("hidden");
        UIOps.resetForm("classForm");
        const saveBtn = document.getElementById("saveClassBtn");
        delete saveBtn.dataset.mode;
        delete saveBtn.dataset.editId;
    });

    document.getElementById("saveClassBtn").addEventListener("click", async () => {
        const name = document.getElementById("className").value;
        const saveBtn = document.getElementById("saveClassBtn");
        if (!name) {
            UIOps.showNotification("Please enter a class name!", "error");
            return;
        }
        try {
            UIOps.showLoading();
            if (saveBtn.dataset.mode === "edit" && saveBtn.dataset.editId) {
                const id = saveBtn.dataset.editId;
                await updateClass(id, name);
            } else {
                await saveClass(name);
            }
            UIOps.resetForm("classForm");
            document.getElementById("classForm").style.display = "none";
            delete saveBtn.dataset.mode;
            delete saveBtn.dataset.editId;
        } catch (error) {
            console.error("Error processing class:", error);
            UIOps.showNotification("Error processing class: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    // Attendance Event Listeners
    document.getElementById("attendanceClass").addEventListener("change", (e) => {
        const classId = e.target.value;
        UIOps.loadAttendanceStudents(classId, students);
        document.getElementById("saveAttendanceBtn").disabled = !classId || !students.filter(s => s.classId === classId).length;
    });

    document.getElementById("saveAttendanceBtn").addEventListener("click", async () => {
        const classId = document.getElementById("attendanceClass").value;
        if (!classId) {
            UIOps.showNotification("Please select a class!", "error");
            return;
        }
        const attendanceData = Array.from(document.querySelectorAll("#attendanceTable select")).reduce((acc, select) => {
            acc[select.dataset.studentId] = select.value;
            return acc;
        }, {});
        try {
            UIOps.showLoading();
            await saveAttendance(classId, attendanceData);
            UIOps.loadAttendanceStudents("", students);
            document.getElementById("attendanceClass").value = "";
            document.getElementById("saveAttendanceBtn").disabled = true;
        } catch (error) {
            console.error("Error saving attendance:", error);
            UIOps.showNotification("Error saving attendance: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    // Past Attendance Filters
    document.getElementById("pastAttendanceDate").addEventListener("change", () => UIOps.loadPastAttendance(attendance, students, classes));
    document.getElementById("pastAttendanceClass").addEventListener("change", () => UIOps.loadPastAttendance(attendance, students, classes));

    // Sessional Marks Filters
    document.getElementById("marksSearchInput").addEventListener("input", () => UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1));
    document.getElementById("marksClassFilter").addEventListener("change", () => UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1));
    document.getElementById("marksPrevPageBtn").addEventListener("click", () => UIOps.loadSessionalMarks(sessionalMarks, students, classes, UIOps.currentPage - 1));
    document.getElementById("marksNextPageBtn").addEventListener("click", () => UIOps.loadSessionalMarks(sessionalMarks, students, classes, UIOps.currentPage + 1));

    // Event Delegation for Actions
    document.querySelector("#teacherPanel .main-content").addEventListener("click", async (e) => {
        const target = e.target;
        if (target.classList.contains("edit-student-btn")) {
            const student = students.find(s => s.id === target.dataset.id);
            if (!student) {
                UIOps.showNotification("Student not found!", "error");
                return;
            }
            document.getElementById("studentName").value = student.name;
            document.getElementById("rollNumber").value = student.rollNumber;
            document.getElementById("studentClass").value = student.classId;
            document.getElementById("studentPassword").value = student.password;
            UIOps.toggleSection("addStudentSection");
            const studentForm = document.getElementById("studentForm");
            studentForm.style.display = "block";
            studentForm.classList.remove("hidden");
            const saveBtn = document.getElementById("saveStudentBtn");
            saveBtn.dataset.mode = "edit";
            saveBtn.dataset.editId = student.id;
        }
        if (target.classList.contains("delete-student-btn") && confirm("Are you sure?")) {
            await deleteStudent(target.dataset.id);
        }
        if (target.classList.contains("edit-homework-btn")) {
            const hw = homework.find(h => h.id === target.dataset.id);
            document.getElementById("homeworkTitle").value = hw.title;
            document.getElementById("homeworkDescription").value = hw.description;
            document.getElementById("homeworkDueDate").value = hw.dueDate;
            document.getElementById("homeworkTarget").value = hw.target;
            document.getElementById("homeworkTargetSpecific").value = hw.targetSpecific;
            UIOps.toggleSection("assignHomeworkSection");
            document.getElementById("saveHomeworkBtn").dataset.mode = "edit";
            document.getElementById("saveHomeworkBtn").dataset.editId = hw.id;
        }
        if (target.classList.contains("delete-homework-btn") && confirm("Are you sure?")) {
            await deleteHomework(target.dataset.id);
        }
        if (target.classList.contains("edit-marks-btn")) {
            const mark = sessionalMarks.find(m => m.id === target.dataset.id);
            document.getElementById("marksClass").value = mark.classId;
            const studentSelect = document.getElementById("marksStudent");
            studentSelect.innerHTML = `<option value="">Select Student</option>` + 
                students.filter(s => s.classId === mark.classId).map(s => `<option value="${s.id}">${s.name}</option>`).join("");
            document.getElementById("marksStudent").value = mark.studentId;
            document.getElementById("marksSubject").value = mark.subject;
            document.getElementById("marksExamType").value = mark.examType;
            document.getElementById("marksObtained").value = mark.marks;
            document.getElementById("marksMax").value = mark.maxMarks;
            document.getElementById("marksDate").value = mark.date;
            UIOps.toggleSection("sessionalMarksSection");
            const saveBtn = document.getElementById("saveMarksBtn");
            saveBtn.dataset.mode = "edit";
            saveBtn.dataset.editId = mark.id;
        }
        if (target.classList.contains("delete-marks-btn") && confirm("Are you sure?")) {
            await deleteSessionalMarks(target.dataset.id);
        }
        if (target.classList.contains("edit-class-btn")) {
            const cls = classes.find(c => c.id === target.dataset.id);
            document.getElementById("className").value = cls.name;
            const saveBtn = document.getElementById("saveClassBtn");
            saveBtn.dataset.mode = "edit";
            saveBtn.dataset.editId = cls.id;
            const classForm = document.getElementById("classForm");
            classForm.style.display = "block";
            classForm.classList.remove("hidden");
        }
        if (target.classList.contains("delete-class-btn") && confirm("Are you sure?")) {
            await deleteClass(target.dataset.id);
        }
    });

    // Pagination and Filters
    document.getElementById("studentPrevPageBtn").addEventListener("click", () => UIOps.loadStudents(students, classes, UIOps.currentPage - 1));
    document.getElementById("studentNextPageBtn").addEventListener("click", () => UIOps.loadStudents(students, classes, UIOps.currentPage + 1));
    document.getElementById("studentSearchInput").addEventListener("input", () => UIOps.loadStudents(students, classes, 1));
    document.getElementById("homeworkPrevPageBtn").addEventListener("click", () => UIOps.loadHomework(homework, students, classes, UIOps.currentPage - 1));
    document.getElementById("homeworkNextPageBtn").addEventListener("click", () => UIOps.loadHomework(homework, students, classes, UIOps.currentPage + 1));
    document.getElementById("homeworkSearchInput").addEventListener("input", () => UIOps.loadHomework(homework, students, classes, 1));
    document.getElementById("homeworkStatusFilter").addEventListener("change", () => UIOps.loadHomework(homework, students, classes, 1));

    // Settings
    document.getElementById("teacherThemeSelect").addEventListener("change", async (e) => {
        const theme = e.target.value;
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        if (currentUser && currentUser.uid) {
            try {
                await Auth.getFreshToken(currentUser);
                await set(ref(database, `teachers/${currentUser.uid}/profile/theme`), theme);
            } catch (error) {
                console.error("Error saving theme:", error);
            }
        }
    });
}

window.onload = () => {
    UIOps.showLoading();
    Auth.onAuthChange(async user => {
        currentUser = user;
        if (user) {
            document.getElementById("teacherLoginModal").style.display = "none";
            document.getElementById("teacherRegisterModal").style.display = "none";
            document.getElementById("teacherPanel").style.display = "block";
            await initializeProfile(user);
            setupRealTimeListeners();
            loadHomeData();
        } else {
            document.getElementById("teacherPanel").style.display = "none";
            document.getElementById("teacherLoginModal").style.display = "flex";
        }
        UIOps.hideLoading();
    });
    initializeTheme();
    setupMobileMenu();
    setupEventListeners();
};