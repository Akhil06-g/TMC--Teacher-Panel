import * as Auth from "./auth.js";
import * as DataOps from "./dataOperations.js";
import * as UIOps from "./uiOperations.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Initialize Firebase Authentication and set persistence
const auth = getAuth();
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("Authentication persistence set to LOCAL");
    })
    .catch(error => {
        console.error("Error setting auth persistence:", error);
        UIOps.showNotification("Failed to set session persistence", "error");
    });

const database = getDatabase(Auth.app);
const storage = getStorage(Auth.app);

let currentUser = null;
let classes = [];
let students = [];
let homework = [];
let attendance = [];
let sessionalMarks = [];
let profile = {};
let recentActivities = [];
let authorities = [];

// Input sanitization to prevent XSS
function sanitizeInput(input) {
    if (typeof input !== "string") return input;
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML.replace(/[<>&"]/g, (c) => ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;"
    })[c]);
}

// File validation for uploads
function validateFile(file, maxSizeMB = 5, allowedTypes = ["image/jpeg", "image/png"]) {
    if (!file) return true; // No file provided
    if (file.size > maxSizeMB * 1024 * 1024) {
        UIOps.showNotification(`File size exceeds ${maxSizeMB}MB limit`, "error");
        return false;
    }
    if (!allowedTypes.includes(file.type)) {
        UIOps.showNotification("Invalid file type. Allowed: JPEG, PNG", "error");
        return false;
    }
    return true;
}

// Password strength validation
function validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
}

// Debounce utility for input events
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

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
    if (!currentUser?.uid) {
        console.error("Cannot set up real-time listeners: No user logged in");
        return;
    }
    const paths = {
        "classes": data => { 
            classes = data || []; 
            UIOps.updateFormOptions(classes, students, homework, attendance, sessionalMarks); 
            UIOps.loadClasses(classes); 
            updateProfileStats();
        },
        "students": data => { 
            students = data || []; 
            UIOps.loadStudents(students, classes, 1); 
            UIOps.updateFormOptions(classes, students, homework, attendance, sessionalMarks); 
            updateProfileStats();
        },
        "homework": data => { 
            homework = data || []; 
            UIOps.loadHomework(homework, students, classes, 1); 
            UIOps.loadAnalytics(homework, students, sessionalMarks); 
            updateProfileStats();
        },
        "attendance": data => { 
            attendance = data || []; 
            UIOps.loadPastAttendance(attendance, students, classes); 
        },
        "sessionalMarks": data => { 
            sessionalMarks = data || []; 
            UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1); 
            UIOps.loadAnalytics(homework, students, sessionalMarks); 
        },
        "profile": data => {
            profile = data || {};
            console.log("Profile updated from Firebase:", profile);
            updateProfileUI();
        },
        "activities": data => {
            recentActivities = data || [];
            UIOps.loadRecentActivities(recentActivities);
        },
        "authorities": data => {
            authorities = data || [];
            UIOps.loadAuthorities(authorities);
        }
    };
    Object.entries(paths).forEach(([path, callback]) => {
        DataOps.listenToData(`teachers/${currentUser.uid}/${path}`, callback);
    });
}

function updateProfileStats() {
    document.getElementById("teacherProfileClasses").textContent = classes.length || 0;
    document.getElementById("teacherProfileStudents").textContent = students.length || 0;
    document.getElementById("teacherProfileHomework").textContent = homework.length || 0;
}

function updateProfileUI() {
    if (!profile || !currentUser) {
        console.warn("Cannot update profile UI: profile or currentUser is null");
        return;
    }
    document.getElementById("teacherProfileName").textContent = sanitizeInput(profile.name || currentUser.email.split("@")[0]);
    document.getElementById("teacherProfileEmail").textContent = sanitizeInput(currentUser.email);
    document.getElementById("teacherProfileRole").textContent = `Role: ${sanitizeInput(profile.role || "Teacher")}`;
    document.getElementById("teacherProfileBio").textContent = sanitizeInput(profile.bio || "No bio provided.");
    document.getElementById("teacherProfilePhone").textContent = sanitizeInput(profile.phone || "N/A");
    document.getElementById("teacherProfileAddress").textContent = sanitizeInput(profile.address || "N/A");
    document.getElementById("teacherProfileSubjects").textContent = profile.subjects?.map(s => sanitizeInput(s)).join(", ") || "None assigned.";
    if (profile.photoURL) {
        document.getElementById("teacherProfilePic").src = profile.photoURL;
    }
    document.getElementById("currentRole").textContent = sanitizeInput(profile.role || "Teacher");
    document.getElementById("currentPermissions").textContent = profile.permissions?.map(p => sanitizeInput(p)).join(", ") || "N/A";
}

function loadHomeData() {
    if (!currentUser || !currentUser.email) {
        console.error("No user logged in for loadHomeData");
        UIOps.showNotification("Please log in to view the dashboard", "error");
        return;
    }
    const teacherName = sanitizeInput(profile.name || currentUser.email.split("@")[0]);
    document.getElementById("teacherName").textContent = teacherName.charAt(0).toUpperCase() + teacherName.slice(1);
    document.getElementById("totalStudents").textContent = students.length || 0;
    document.getElementById("pendingHomework").textContent = homework.filter(h => h.status === "Pending").length || 0;
    document.getElementById("submittedHomework").textContent = homework.filter(h => h.status === "Submitted").length || 0;
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
    name = sanitizeInput(name);
    rollNumber = sanitizeInput(rollNumber);
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.saveData(`teachers/${currentUser.uid}/students`, { name, rollNumber, classId, password });
        await logActivity(`Added student: ${name}`);
        UIOps.showNotification("Student added successfully!");
    } catch (error) {
        console.error("Error saving student:", error);
        UIOps.showNotification("Error saving student: " + error.message, "error");
    }
}

async function updateStudent(id, name, rollNumber, classId, password) {
    name = sanitizeInput(name);
    rollNumber = sanitizeInput(rollNumber);
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/students/${id}`, { name, rollNumber, classId, password });
        await logActivity(`Updated student: ${name}`);
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
        await logActivity(`Deleted student ID: ${id}`);
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
            if (!validateFile(file, 5, ["image/jpeg", "image/png", "application/pdf"])) return;
            UIOps.showUploading();
            const fileRef = storageRef(storage, `teachers/${currentUser.uid}/homework/${Date.now()}_${sanitizeInput(file.name)}`);
            await uploadBytes(fileRef, file);
            fileUrl = await getDownloadURL(fileRef);
        } else {
            UIOps.showLoading();
        }
        data.title = sanitizeInput(data.title);
        data.description = sanitizeInput(data.description);
        await DataOps.saveData(`teachers/${currentUser.uid}/homework`, { ...data, fileUrl, status: "Pending" });
        await logActivity(`Assigned homework: ${data.title}`);
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
            if (!validateFile(file, 5, ["image/jpeg", "image/png", "application/pdf"])) return;
            UIOps.showUploading();
            const fileRef = storageRef(storage, `teachers/${currentUser.uid}/homework/${Date.now()}_${sanitizeInput(file.name)}`);
            await uploadBytes(fileRef, file);
            fileUrl = await getDownloadURL(fileRef);
        } else {
            UIOps.showLoading();
        }
        data.title = sanitizeInput(data.title);
        data.description = sanitizeInput(data.description);
        await DataOps.updateData(`teachers/${currentUser.uid}/homework/${id}`, { ...data, fileUrl, status: "Pending" });
        await logActivity(`Updated homework: ${data.title}`);
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
        await logActivity(`Deleted homework ID: ${id}`);
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
        await logActivity(`Saved attendance for class ID: ${classId}`);
        UIOps.showNotification("Attendance saved successfully!");
    } catch (error) {
        console.error("Error saving attendance:", error);
        UIOps.showNotification("Error saving attendance: " + error.message, "error");
    }
}

async function saveSessionalMarks(data) {
    data.subject = sanitizeInput(data.subject);
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.saveData(`teachers/${currentUser.uid}/sessionalMarks`, data);
        await logActivity(`Assigned marks for ${data.subject}`);
        UIOps.showNotification("Marks assigned successfully!");
    } catch (error) {
        console.error("Error saving marks:", error);
        UIOps.showNotification("Error saving marks: " + error.message, "error");
    }
}

async function updateSessionalMarks(id, data) {
    data.subject = sanitizeInput(data.subject);
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/sessionalMarks/${id}`, data);
        await logActivity(`Updated marks for ${data.subject}`);
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
        await logActivity(`Deleted marks ID: ${id}`);
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
    name = sanitizeInput(name);
    const path = `teachers/${currentUser.uid}/classes`;
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.saveData(path, { name });
        await logActivity(`Added class: ${name}`);
        UIOps.showNotification("Class added successfully!");
    } catch (error) {
        console.error("Error saving class:", error, "Path:", path);
        UIOps.showNotification("Error saving class: " + error.message, "error");
    }
}

async function updateClass(id, name) {
    name = sanitizeInput(name);
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/classes/${id}`, { name });
        await logActivity(`Updated class: ${name}`);
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
        await logActivity(`Deleted class ID: ${id}`);
        UIOps.showNotification("Class deleted successfully!");
    } catch (error) {
        console.error("Error deleting class:", error);
        UIOps.showNotification("Error deleting class: " + error.message, "error");
    }
}

async function saveProfile(data) {
    if (!currentUser || !currentUser.uid) {
        console.error("Cannot save profile: No user logged in");
        UIOps.showNotification("You must be logged in to save profile!", "error");
        return;
    }
    const path = `teachers/${currentUser.uid}/profile`;
    try {
        console.log("Saving profile data:", data);
        await Auth.getFreshToken(currentUser);
        await set(ref(database, path), {
            email: data.email,
            name: sanitizeInput(data.name || ""),
            bio: sanitizeInput(data.bio || ""),
            phone: sanitizeInput(data.phone || ""),
            address: sanitizeInput(data.address || ""),
            subjects: data.subjects || [],
            photoURL: data.photoURL || "",
            role: data.role || "teacher",
            permissions: data.permissions || ["view_dashboard", "manage_students", "assign_homework", "record_attendance", "assign_marks"],
            notifications: data.notifications || { homework: true, students: true },
            theme: data.theme || "light"
        });
        profile = data; // Update local profile immediately
        console.log("Profile saved successfully to Firebase");
        await logActivity("Updated profile");
        UIOps.showNotification("Profile updated successfully!");
        updateProfileUI(); // Update UI immediately after saving
    } catch (error) {
        console.error("Error saving profile:", error, "Path:", path);
        UIOps.showNotification("Error saving profile: " + error.message, "error");
    }
}

async function saveAuthority(data) {
    const path = `teachers/${currentUser.uid}/authorities`;
    data.email = sanitizeInput(data.email);
    data.role = sanitizeInput(data.role);
    data.permissions = data.permissions.map(p => sanitizeInput(p));
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.saveData(path, data);
        await logActivity(`Assigned authority: ${data.role} to ${data.email}`);
        UIOps.showNotification("Authority assigned successfully!");
    } catch (error) {
        console.error("Error saving authority:", error);
        UIOps.showNotification("Error saving authority: " + error.message, "error");
    }
}

async function updateAuthority(id, data) {
    data.email = sanitizeInput(data.email);
    data.role = sanitizeInput(data.role);
    data.permissions = data.permissions.map(p => sanitizeInput(p));
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.updateData(`teachers/${currentUser.uid}/authorities/${id}`, data);
        await logActivity(`Updated authority: ${data.role} for ${data.email}`);
        UIOps.showNotification("Authority updated successfully!");
    } catch (error) {
        console.error("Error updating authority:", error);
        UIOps.showNotification("Error updating authority: " + error.message, "error");
    }
}

async function deleteAuthority(id) {
    try {
        await Auth.getFreshToken(currentUser);
        await DataOps.deleteData(`teachers/${currentUser.uid}/authorities/${id}`);
        await logActivity(`Deleted authority ID: ${id}`);
        UIOps.showNotification("Authority deleted successfully!");
    } catch (error) {
        console.error("Error deleting authority:", error);
        UIOps.showNotification("Error deleting authority: " + error.message, "error");
    }
}

async function logActivity(action) {
    if (!currentUser || !currentUser.uid) return;
    const path = `teachers/${currentUser.uid}/activities`;
    action = sanitizeInput(action);
    try {
        await DataOps.saveData(path, {
            action,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}

async function initializeProfile(user) {
    if (!user || !user.uid || !user.email) {
        console.error("Cannot initialize profile: Invalid user data");
        UIOps.showNotification("Authentication error: Invalid user data", "error");
        return;
    }
    const path = `teachers/${user.uid}/profile`;
    try {
        await Auth.getFreshToken(user);
        const defaultProfile = {
            email: user.email,
            name: sanitizeInput(user.email.split("@")[0]),
            notifications: { homework: true, students: true },
            theme: "light",
            photoURL: "",
            bio: "",
            phone: "",
            address: "",
            subjects: [],
            role: "teacher",
            permissions: ["view_dashboard", "manage_students", "assign_homework", "record_attendance", "assign_marks"]
        };
        await set(ref(database, path), defaultProfile);
        profile = defaultProfile; // Update local profile
        await logActivity("Initialized profile");
        console.log("Profile initialized for:", user.email);
    } catch (error) {
        console.error("Error initializing profile:", error, "Path:", path);
        UIOps.showNotification("Error initializing profile: " + error.message, "error");
    }
}

function loadAccountCircles() {
    const accounts = JSON.parse(localStorage.getItem("teacherAccounts") || "[]");
    const accountCircles = document.getElementById("accountCircles");
    if (accountCircles) {
        accountCircles.innerHTML = accounts.map(email => `
            <div class="account-circle" data-email="${sanitizeInput(email)}">
                <span>${sanitizeInput(email.charAt(0).toUpperCase())}</span>
                <div class="email-tooltip">${sanitizeInput(email)}</div>
            </div>
        `).join("");
        document.querySelectorAll(".account-circle").forEach(circle => {
            circle.addEventListener("click", () => {
                const email = circle.dataset.email;
                document.getElementById("teacherLoginEmail").value = email;
                document.getElementById("teacherLoginPassword").value = "";
                document.getElementById("teacherLoginForm").style.display = "block";
                document.getElementById("accountSelection").style.display = "none";
            });
        });
    }
}

function addAccountToStorage(email) {
    if (!email) return;
    const accounts = JSON.parse(localStorage.getItem("teacherAccounts") || "[]");
    if (!accounts.includes(email)) {
        accounts.push(sanitizeInput(email));
        localStorage.setItem("teacherAccounts", JSON.stringify(accounts));
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
            const user = await Auth.login(email, password);
            if (!user || !user.email) {
                throw new Error("Invalid user data returned from login");
            }
            currentUser = user;
            addAccountToStorage(email);
            document.getElementById("teacherLoginModal").style.display = "none";
            UIOps.showNotification("Login successful!");
            await initializeProfile(user);
            setupRealTimeListeners();
            loadHomeData();
            UIOps.toggleSection("teacherHomeSection");
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
        if (!validatePasswordStrength(password)) {
            document.getElementById("teacherRegisterError").textContent = "Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.";
            document.getElementById("teacherRegisterError").style.display = "block";
            return;
        }
        try {
            UIOps.showLoading();
            const user = await Auth.register(email, password);
            if (!user || !user.email) {
                throw new Error("Invalid user data returned from registration");
            }
            currentUser = user;
            addAccountToStorage(email);
            document.getElementById("teacherRegisterModal").style.display = "none";
            UIOps.showNotification("Registration successful!");
            await initializeProfile(user);
            setupRealTimeListeners();
            loadHomeData();
            UIOps.toggleSection("teacherHomeSection");
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
        document.getElementById("teacherLoginForm").style.display = "none";
        document.getElementById("accountSelection").style.display = "block";
        loadAccountCircles();
    });

    // Add Account Button
    document.getElementById("addAccountBtn").addEventListener("click", () => {
        document.getElementById("teacherLoginForm").style.display = "block";
        document.getElementById("accountSelection").style.display = "none";
        document.getElementById("teacherLoginEmail").value = "";
        document.getElementById("teacherLoginPassword").value = "";
    });

    // Close Login Modal
    document.getElementById("closeTeacherLoginBtn").addEventListener("click", () => {
        document.getElementById("teacherLoginModal").style.display = "none";
        document.getElementById("teacherLoginForm").style.display = "none";
        document.getElementById("accountSelection").style.display = "block";
        loadAccountCircles();
    });

    // Close Register Modal
    document.getElementById("closeTeacherRegisterBtn").addEventListener("click", () => {
        document.getElementById("teacherRegisterModal").style.display = "none";
        document.getElementById("teacherLoginModal").style.display = "flex";
        document.getElementById("teacherLoginForm").style.display = "none";
        document.getElementById("accountSelection").style.display = "block";
        loadAccountCircles();
    });

    // Profile Event Listeners
    document.getElementById("teacherProfileBtn").addEventListener("click", () => {
        UIOps.toggleSection("teacherProfileSection");
        updateProfileUI();
    });

    document.getElementById("editProfileBtn").addEventListener("click", () => {
        document.getElementById("profileName").value = sanitizeInput(profile.name || "");
        document.getElementById("profileEmail").value = currentUser.email;
        document.getElementById("profilePhone").value = sanitizeInput(profile.phone || "");
        document.getElementById("profileAddress").value = sanitizeInput(profile.address || "");
        document.getElementById("profileSubjects").value = profile.subjects?.map(s => sanitizeInput(s)).join(", ") || "";
        document.getElementById("profileBio").value = sanitizeInput(profile.bio || "");
        UIOps.toggleSection("profileEditSection");
    });

    document.getElementById("viewActivityBtn").addEventListener("click", () => {
        UIOps.toggleSection("recentActivitySection");
        UIOps.loadRecentActivities(recentActivities);
    });

    document.getElementById("manageAuthoritiesBtn").addEventListener("click", () => {
        UIOps.toggleSection("authoritiesSection");
        UIOps.loadAuthorities(authorities);
    });

    document.getElementById("profilePic").addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file && validateFile(file, 2, ["image/jpeg", "image/png"])) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById("profilePicPreview").src = event.target.result;
                document.getElementById("profilePicPreview").style.display = "block";
            };
            reader.readAsDataURL(file);
        } else {
            document.getElementById("profilePicPreview").style.display = "none";
        }
    });

    document.getElementById("saveProfileBtn").addEventListener("click", async () => {
        if (!currentUser || !currentUser.uid) {
            UIOps.showNotification("You must be logged in to save profile!", "error");
            return;
        }
        const data = {
            name: document.getElementById("profileName").value,
            email: currentUser.email,
            bio: document.getElementById("profileBio").value,
            phone: document.getElementById("profilePhone").value,
            address: document.getElementById("profileAddress").value,
            subjects: document.getElementById("profileSubjects").value.split(",").map(s => s.trim()).filter(s => s),
            notifications: profile.notifications || { homework: true, students: true },
            theme: profile.theme || "light",
            photoURL: profile.photoURL || "",
            role: profile.role || "teacher",
            permissions: profile.permissions || ["view_dashboard", "manage_students", "assign_homework", "record_attendance", "assign_marks"]
        };
        const file = document.getElementById("profilePic")?.files[0];
        try {
            UIOps.showLoading();
            if (file) {
                if (!validateFile(file, 2, ["image/jpeg", "image/png"])) {
                    UIOps.hideLoading();
                    return;
                }
                UIOps.showUploading();
                const fileRef = storageRef(storage, `teachers/${currentUser.uid}/profile/${Date.now()}_${sanitizeInput(file.name)}`);
                await uploadBytes(fileRef, file);
                data.photoURL = await getDownloadURL(fileRef);
            }
            await saveProfile(data);
            UIOps.resetForm("profileForm");
            document.getElementById("profilePicPreview").style.display = "none";
            UIOps.toggleSection("teacherProfileSection");
        } catch (error) {
            console.error("Error saving profile:", error);
            UIOps.showNotification("Error saving profile: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    // Authorities Event Listeners
    document.getElementById("saveAuthoritiesBtn").addEventListener("click", async () => {
        const data = {
            email: currentUser.email, // For demo; in production, allow selecting other users
            role: document.getElementById("authorityRole").value,
            permissions: [
                document.getElementById("permManageUsers").checked ? "manage_users" : null,
                document.getElementById("permManageClasses").checked ? "manage_classes" : null,
                document.getElementById("permAssignHomework").checked ? "assign_homework" : null,
                document.getElementById("permRecordAttendance").checked ? "record_attendance" : null,
                document.getElementById("permAssignMarks").checked ? "assign_marks" : null
            ].filter(p => p)
        };
        if (!data.role) {
            UIOps.showNotification("Please select a role!", "error");
            return;
        }
        const saveBtn = document.getElementById("saveAuthoritiesBtn");
        try {
            UIOps.showLoading();
            if (saveBtn.dataset.mode === "edit" && saveBtn.dataset.editId) {
                const id = saveBtn.dataset.editId;
                await updateAuthority(id, data);
            } else {
                await saveAuthority(data);
            }
            UIOps.resetForm("authoritiesForm");
            UIOps.toggleSection("authoritiesSection");
            delete saveBtn.dataset.mode;
            delete saveBtn.dataset.editId;
        } catch (error) {
            console.error("Error processing authority:", error);
            UIOps.showNotification("Error processing authority: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
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
        if (currentUser && currentUser.email) {
            document.getElementById("settingsEmail").value = currentUser.email;
        }
    });
    document.getElementById("teacherLogoutBtn").addEventListener("click", async () => {
        try {
            await Auth.logout();
            currentUser = null;
            profile = {};
            document.getElementById("teacherLoginModal").style.display = "flex";
            document.getElementById("teacherLoginForm").style.display = "none";
            document.getElementById("accountSelection").style.display = "block";
            loadAccountCircles();
            UIOps.showNotification("Logged out successfully!");
        } catch (error) {
            console.error("Logout error:", error);
            UIOps.showNotification("Error logging out: " + error.message, "error");
        }
    });

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
        const saveBtn = document.getElementById("saveHomeworkBtn");
        try {
            UIOps.showLoading();
            if (saveBtn.dataset.mode === "edit" && saveBtn.dataset.editId) {
                const id = saveBtn.dataset.editId;
                await updateHomework(id, data);
            } else {
                await saveHomework(data);
            }
            UIOps.resetForm("homeworkForm");
            UIOps.toggleSection("homeworkStatusSection");
            delete saveBtn.dataset.mode;
            delete saveBtn.dataset.editId;
        } catch (error) {
            console.error("Error processing homework:", error);
            UIOps.showNotification("Error processing homework: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    document.getElementById("homeworkTarget").addEventListener("change", (e) => {
        const targetSpecific = document.getElementById("homeworkTargetSpecific");
        targetSpecific.style.display = e.target.value === "all" ? "none" : "block";
        targetSpecific.innerHTML = "";
        if (e.target.value === "student") {
            students.forEach(student => {
                const option = document.createElement("option");
                option.value = student.id;
                option.textContent = sanitizeInput(student.name);
                targetSpecific.appendChild(option);
            });
        } else if (e.target.value === "class") {
            classes.forEach(cls => {
                const option = document.createElement("option");
                option.value = cls.id;
                option.textContent = sanitizeInput(cls.name);
                targetSpecific.appendChild(option);
            });
        }
    });

    // Attendance Event Listeners
    document.getElementById("attendanceClass").addEventListener("change", (e) => {
        const classId = e.target.value;
        UIOps.loadAttendanceStudents(classId, students);
    });

    document.getElementById("saveAttendanceBtn").addEventListener("click", async () => {
        const classId = document.getElementById("attendanceClass").value;
        if (!classId) {
            UIOps.showNotification("Please select a class!", "error");
            return;
        }
        const attendanceData = {};
        document.querySelectorAll("#attendanceTable select").forEach(select => {
            const studentId = select.dataset.studentId;
            attendanceData[studentId] = select.value;
        });
        try {
            UIOps.showLoading();
            await saveAttendance(classId, attendanceData);
            UIOps.loadAttendanceStudents("", students);
            document.getElementById("saveAttendanceBtn").disabled = true;
        } catch (error) {
            console.error("Error saving attendance:", error);
            UIOps.showNotification("Error saving attendance: " + error.message, "error");
        } finally {
            UIOps.hideLoading();
        }
    });

    document.getElementById("pastAttendanceDate").addEventListener("change", () => {
        UIOps.loadPastAttendance(attendance, students, classes);
    });

    document.getElementById("pastAttendanceClass").addEventListener("change", () => {
        UIOps.loadPastAttendance(attendance, students, classes);
    });

    // Sessional Marks Event Listeners
    document.getElementById("marksClass").addEventListener("change", (e) => {
        const classId = e.target.value;
        const studentSelect = document.getElementById("marksStudent");
        studentSelect.innerHTML = "<option value=''>Select Student</option>";
        if (classId) {
            students.filter(s => s.classId === classId).forEach(student => {
                const option = document.createElement("option");
                option.value = student.id;
                option.textContent = sanitizeInput(student.name);
                studentSelect.appendChild(option);
            });
        }
    });

    document.getElementById("saveMarksBtn").addEventListener("click", async () => {
        const data = {
            classId: document.getElementById("marksClass").value,
            studentId: document.getElementById("marksStudent").value,
            subject: document.getElementById("marksSubject").value,
            examType: document.getElementById("marksExamType").value,
            marksObtained: parseInt(document.getElementById("marksObtained").value),
            maxMarks: parseInt(document.getElementById("marksMax").value),
            date: document.getElementById("marksDate").value
        };
        if (!data.classId || !data.studentId || !data.subject || !data.examType || !data.marksObtained || !data.maxMarks || !data.date) {
            UIOps.showNotification("Please fill all fields!", "error");
            return;
        }
        if (data.marksObtained > data.maxMarks) {
            UIOps.showNotification("Obtained marks cannot exceed max marks!", "error");
            return;
        }
        const saveBtn = document.getElementById("saveMarksBtn");
        try {
            UIOps.showLoading();
            if (saveBtn.dataset.mode === "edit" && saveBtn.dataset.editId) {
                const id = saveBtn.dataset.editId;
                await updateSessionalMarks(id, data);
            } else {
                await saveSessionalMarks(data);
            }
            UIOps.resetForm("sessionalMarksForm");
            UIOps.toggleSection("sessionalMarksSection");
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
        if (!name) {
            UIOps.showNotification("Please enter a class name!", "error");
            return;
        }
        const saveBtn = document.getElementById("saveClassBtn");
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

    // Settings Event Listeners
    document.getElementById("teacherThemeSelect").addEventListener("change", (e) => {
        const theme = e.target.value;
        localStorage.setItem("theme", theme);
        document.documentElement.setAttribute("data-theme", theme);
        profile.theme = theme;
        saveProfile(profile);
    });

    document.getElementById("homeworkNotifications").addEventListener("change", (e) => {
        profile.notifications = profile.notifications || {};
        profile.notifications.homework = e.target.checked;
        saveProfile(profile);
    });

    document.getElementById("studentNotifications").addEventListener("change", (e) => {
        profile.notifications = profile.notifications || {};
        profile.notifications.students = e.target.checked;
        saveProfile(profile);
    });

    document.getElementById("exportTeacherDataBtn").addEventListener("click", () => {
        const data = {
            classes,
            students,
            homework,
            attendance,
            sessionalMarks,
            profile,
            authorities
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `teacher_data_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        logActivity("Exported teacher data");
    });

    document.getElementById("updateAccountBtn").addEventListener("click", () => {
        UIOps.showNotification("Account updates are not supported in this version.", "error");
    });

    // Activity Filtering
    document.getElementById("activitySearchInput").addEventListener("input", debounce(() => {
        UIOps.loadRecentActivities(recentActivities);
    }, 300));

    document.getElementById("activityFilter").addEventListener("change", () => {
        UIOps.loadRecentActivities(recentActivities);
    });

    // Pagination and Filters with Debouncing
    document.getElementById("studentSearchInput").addEventListener("input", debounce(() => {
        UIOps.loadStudents(students, classes, 1);
    }, 300));

    document.getElementById("studentClassFilter").addEventListener("change", () => {
        UIOps.loadStudents(students, classes, 1);
    });

    document.getElementById("studentPrevPageBtn").addEventListener("click", () => {
        const currentPage = parseInt(document.getElementById("studentPageInfo").dataset.page) || 1;
        if (currentPage > 1) {
            UIOps.loadStudents(students, classes, currentPage - 1);
        }
    });

    document.getElementById("studentNextPageBtn").addEventListener("click", () => {
        const currentPage = parseInt(document.getElementById("studentPageInfo").dataset.page) || 1;
        UIOps.loadStudents(students, classes, currentPage + 1);
    });

    document.getElementById("homeworkSearchInput").addEventListener("input", debounce(() => {
        UIOps.loadHomework(homework, students, classes, 1);
    }, 300));

    document.getElementById("homeworkStatusFilter").addEventListener("change", () => {
        UIOps.loadHomework(homework, students, classes, 1);
    });

    document.getElementById("homeworkPrevPageBtn").addEventListener("click", () => {
        const currentPage = parseInt(document.getElementById("homeworkPageInfo").dataset.page) || 1;
        if (currentPage > 1) {
            UIOps.loadHomework(homework, students, classes, currentPage - 1);
        }
    });

    document.getElementById("homeworkNextPageBtn").addEventListener("click", () => {
        const currentPage = parseInt(document.getElementById("homeworkPageInfo").dataset.page) || 1;
        UIOps.loadHomework(homework, students, classes, currentPage + 1);
    });

    document.getElementById("marksSearchInput").addEventListener("input", debounce(() => {
        UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1);
    }, 300));

    document.getElementById("marksClassFilter").addEventListener("change", () => {
        UIOps.loadSessionalMarks(sessionalMarks, students, classes, 1);
    });

    document.getElementById("marksPrevPageBtn").addEventListener("click", () => {
        const currentPage = parseInt(document.getElementById("marksPageInfo").dataset.page) || 1;
        if (currentPage > 1) {
            UIOps.loadSessionalMarks(sessionalMarks, students, classes, currentPage - 1);
        }
    });

    document.getElementById("marksNextPageBtn").addEventListener("click", () => {
        const currentPage = parseInt(document.getElementById("marksPageInfo").dataset.page) || 1;
        UIOps.loadSessionalMarks(sessionalMarks, students, classes, currentPage + 1);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded, initializing application...");
    initializeTheme();
    setupMobileMenu();
    loadAccountCircles();
    setupEventListeners();
    Auth.onAuthStateChanged(async (user) => {
        console.log("Auth state changed:", user ? `User logged in: ${user.email}` : "No user logged in");
        if (user && user.email) {
            currentUser = user;
            document.getElementById("teacherLoginModal").style.display = "none";
            try {
                await initializeProfile(user);
                setupRealTimeListeners();
                loadHomeData();
                UIOps.toggleSection("teacherHomeSection");
                console.log("User session restored, dashboard loaded");
            } catch (error) {
                console.error("Error restoring session:", error);
                UIOps.showNotification("Error restoring session: " + error.message, "error");
                document.getElementById("teacherLoginModal").style.display = "flex";
                document.getElementById("teacherLoginForm").style.display = "none";
                document.getElementById("accountSelection").style.display = "block";
                loadAccountCircles();
            }
        } else {
            currentUser = null;
            profile = {};
            document.getElementById("teacherLoginModal").style.display = "flex";
            document.getElementById("teacherLoginForm").style.display = "none";
            document.getElementById("accountSelection").style.display = "block";
            loadAccountCircles();
            console.log("No user logged in, showing login modal");
        }
    });
});
