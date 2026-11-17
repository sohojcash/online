/* Shohoj Cash static front-end configuration.
 * Deploy the Google Apps Script in backend/Code.gs and paste its /exec URL below.
 * Never place payment-gateway secrets or private API keys in this file.
 */
const SITE_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxugzQwXGqWnN8Szzu5HKqyye9KGHKSGc2ctDzqsybseMvLfj3WC4JiOr08DTxLlo7B/exec", // Example: https://script.google.com/macros/s/DEPLOYMENT_ID/exec
  PAYMENT_GATEWAY_READY: false // Set up an official merchant checkout + server verification before enabling.
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const loanForm = $("#loanForm");
const statusBox = $("#formStatus");
const submitButton = $("#submitBtn");
const backendFrame = $("#backendFrame");
const backendPostForm = $("#backendPostForm");
let waitingForBackend = false;
let backendTimeout = null;
let statusPollTimer = null;
let activeStatusScript = null;
let statusCallbackReceived = false;
let activeRequestId = "";

function createRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}
function closeModal(el) {
  const modal = typeof el === "string" ? document.getElementById(el) : el;
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!$$(".modal-backdrop.is-open").length) document.body.classList.remove("modal-open");
}

// Mobile navigation
$("#menuToggle").addEventListener("click", () => {
  const nav = $("#mainNav");
  const isOpen = nav.classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(isOpen));
});
$$("#mainNav a").forEach(link => link.addEventListener("click", () => {
  $("#mainNav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
}));

// Welcome animation flow: first question, then instruction popup.
window.addEventListener("load", () => {
  if (!sessionStorage.getItem("shohojcash-welcome-seen")) {
    window.setTimeout(() => openModal("welcomeModal"), 500);
    sessionStorage.setItem("shohojcash-welcome-seen", "1");
  }
});
$("#welcomeYes").addEventListener("click", () => {
  closeModal("welcomeModal");
  window.setTimeout(() => openModal("instructionModal"), 180);
});
$("#goToForm").addEventListener("click", () => {
  closeModal("instructionModal");
  $("#apply").scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => $("[name='name']").focus({ preventScroll: true }), 550);
});
$$('[data-close-modal]').forEach(button => button.addEventListener("click", () => {
  const modal = button.closest(".modal-backdrop");
  closeModal(modal);
}));
$$(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => {
  if (event.target === backdrop && backdrop.id !== "paymentModal") closeModal(backdrop);
}));
$$('[data-open-policy]').forEach(button => button.addEventListener("click", () => openModal("policyModal")));
$$('[data-open-terms]').forEach(button => button.addEventListener("click", () => openModal("termsModal")));

// Normalize Bangla numerals before validation/storage.
const banglaDigits = "০১২৩৪৫৬৭৮৯";
function toEnglishDigits(value) {
  return String(value ?? "").replace(/[০-৯]/g, digit => String(banglaDigits.indexOf(digit)));
}
function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
function validBdPhone(value) {
  const phone = toEnglishDigits(value).replace(/[\s-]/g, "");
  return /^01[3-9]\d{8}$/.test(phone);
}
function showStatus(message, type = "error") {
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`;
}
function selectedValue(name) {
  return $(`input[name="${name}"]:checked`, loanForm)?.value || "";
}
function collectApplication() {
  const formData = new FormData(loanForm);
  return {
    website: cleanText(formData.get("website")),
    name: cleanText(formData.get("name")),
    fatherName: cleanText(formData.get("fatherName")),
    motherName: cleanText(formData.get("motherName")),
    dob: cleanText(formData.get("dob")),
    nid: toEnglishDigits(cleanText(formData.get("nid"))),
    division: cleanText(formData.get("division")),
    district: cleanText(formData.get("district")),
    thana: cleanText(formData.get("thana")),
    road: cleanText(formData.get("road")),
    phone: toEnglishDigits(cleanText(formData.get("phone"))).replace(/[\s-]/g, ""),
    loanType: selectedValue("loanType"),
    loanAmount: Number(formData.get("loanAmount")),
    duration: Number(selectedValue("duration")),
    receiveMethod: selectedValue("receiveMethod"),
    receiveNumber: toEnglishDigits(cleanText(formData.get("receiveNumber"))).replace(/[\s-]/g, ""),
    consent: Boolean(formData.get("consent")),
    source: "shohojcash.online",
    submittedAtClient: new Date().toISOString()
  };
}
function validateApplication(data) {
  if (!data.name || !data.fatherName || !data.motherName) return "নাম, পিতার নাম ও মাতার নাম পূরণ করুন।";
  if (!validBdPhone(data.phone)) return "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।";
  if (data.dob && data.dob > new Date().toISOString().slice(0, 10)) return "জন্ম তারিখ ভবিষ্যতের হতে পারে না।";
  if (!data.loanType) return "ঋণের ধরন নির্বাচন করুন।";
  const allowedAmounts = [5000,10000,20000,25000,30000,40000,50000,75000,100000,150000,200000,250000,300000,400000,500000];
  if (!allowedAmounts.includes(data.loanAmount)) return "সঠিক ঋণের পরিমাণ নির্বাচন করুন।";
  if (![3,6,12].includes(data.duration)) return "ঋণ পরিশোধের সময় নির্বাচন করুন।";
  if (!["bKash","Nagad"].includes(data.receiveMethod)) return "টাকা গ্রহণের মাধ্যম নির্বাচন করুন।";
  if (!validBdPhone(data.receiveNumber)) return "টাকা গ্রহণের অ্যাকাউন্টের সঠিক মোবাইল নম্বর লিখুন।";
  if (!data.consent) return "তথ্য ব্যবহারের নীতিমালায় সম্মতি দিতে হবে।";
  return "";
}

function restoreSubmitButton() {
  submitButton.disabled = false;
  submitButton.innerHTML = 'আবেদন জমা দিন <span>→</span>';
}

function stopStatusPolling() {
  if (statusPollTimer) window.clearTimeout(statusPollTimer);
  statusPollTimer = null;
  if (activeStatusScript) activeStatusScript.remove();
  activeStatusScript = null;
}

function completeSuccessfulSubmission(result) {
  if (!waitingForBackend || !activeRequestId) return;
  if (result && result.requestId && result.requestId !== activeRequestId) return;

  window.clearTimeout(backendTimeout);
  stopStatusPolling();
  waitingForBackend = false;
  activeRequestId = "";
  restoreSubmitButton();

  showStatus("আপনার আবেদন জমা হয়েছে। নিচে আবেদন ফি-র পরবর্তী ধাপ দেখুন।", "success");
  $("#applicationRef").textContent = `আবেদন নম্বর: ${(result && result.applicationId) || "জমা হয়েছে"}`;
  openModal("paymentModal");
}

function completeFailedSubmission(message) {
  if (!waitingForBackend) return;
  window.clearTimeout(backendTimeout);
  stopStatusPolling();
  waitingForBackend = false;
  activeRequestId = "";
  restoreSubmitButton();
  showStatus(message || "আবেদন জমা করা যায়নি। আবার চেষ্টা করার আগে Google Sheet পরীক্ষা করুন।", "error");
}

// Read-only JSONP polling avoids depending on postMessage crossing the Apps Script sandbox.
window.shohojcashStatusCallback = function (result) {
  if (!waitingForBackend || !activeRequestId || !result) return;
  if (result.requestId !== activeRequestId) return;
  statusCallbackReceived = true;

  if (result.status === "saved" && result.ok === true) {
    completeSuccessfulSubmission(result);
    return;
  }
  const delay = result.status === "pending" ? 1800 : 3000;
  statusPollTimer = window.setTimeout(() => pollApplicationStatus(activeRequestId), delay);
};

function pollApplicationStatus(requestId) {
  if (!waitingForBackend || !requestId || requestId !== activeRequestId) return;
  if (activeStatusScript) activeStatusScript.remove();

  const script = document.createElement("script");
  activeStatusScript = script;
  statusCallbackReceived = false;
  script.async = true;
  script.src = `${SITE_CONFIG.APPS_SCRIPT_URL}?action=status&requestId=${encodeURIComponent(requestId)}&prefix=shohojcashStatusCallback&_=${Date.now()}`;
  script.onload = () => {
    window.setTimeout(() => {
      if (activeStatusScript === script) {
        script.remove();
        activeStatusScript = null;
      }
      if (!statusCallbackReceived && waitingForBackend && activeRequestId === requestId) {
        statusPollTimer = window.setTimeout(() => pollApplicationStatus(requestId), 3000);
      }
    }, 0);
  };
  script.onerror = () => {
    if (activeStatusScript === script) {
      script.remove();
      activeStatusScript = null;
    }
    if (waitingForBackend && activeRequestId === requestId) {
      statusPollTimer = window.setTimeout(() => pollApplicationStatus(requestId), 3000);
    }
  };
  document.head.appendChild(script);
}

loanForm.addEventListener("submit", event => {
  event.preventDefault();
  if (waitingForBackend) return;
  const data = collectApplication();
  const validationMessage = validateApplication(data);
  if (validationMessage) {
    showStatus(validationMessage, "error");
    const firstInvalid = loanForm.querySelector(":invalid");
    firstInvalid?.focus({ preventScroll: false });
    return;
  }
  if (!SITE_CONFIG.APPS_SCRIPT_URL || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(SITE_CONFIG.APPS_SCRIPT_URL)) {
    showStatus("আবেদন সংরক্ষণের Google Sheets সংযোগ এখনো সেটআপ করা হয়নি। README-BN.md অনুসরণ করে Apps Script URL যুক্ত করুন।", "error");
    return;
  }
  waitingForBackend = true;
  activeRequestId = createRequestId();
  $("#backendRequestId").value = activeRequestId;
  submitButton.disabled = true;
  submitButton.textContent = "জমা হচ্ছে...";
  showStatus("আপনার আবেদন নিরাপদে জমা দেওয়ার চেষ্টা চলছে...", "success");
  $("#backendPayload").value = JSON.stringify(data);
  backendPostForm.action = SITE_CONFIG.APPS_SCRIPT_URL;
  backendPostForm.submit();

  // Poll the Sheet for this exact request. A pending result never opens payment.
  statusPollTimer = window.setTimeout(() => pollApplicationStatus(activeRequestId), 1200);

  backendTimeout = window.setTimeout(() => {
    if (waitingForBackend) {
      stopStatusPolling();
      waitingForBackend = false;
      activeRequestId = "";
      restoreSubmitButton();
      showStatus("সার্ভারে আবেদন জমার নিশ্চিতকরণ পাওয়া যায়নি। আবেদনটি Sheet-এ থাকতে পারে—আবার জমা দেওয়ার আগে Sheet পরীক্ষা করুন বা 01332-002097 নম্বরে যোগাযোগ করুন।", "error");
    }
  }, 60000);
});

// Apps Script responds inside the hidden iframe and posts a result to this page.
window.addEventListener("message", event => {
  // Fast-path response when the Apps Script sandbox allows the message through.
  // JSONP Sheet-status polling remains the reliable fallback.
  if (!event.data || event.data.type !== "SHOHOJCASH_SUBMIT") return;
  if (!waitingForBackend || !activeRequestId || event.data.requestId !== activeRequestId) return;
  if (event.data.ok) completeSuccessfulSubmission(event.data);
  else completeFailedSubmission(event.data.message);
});

// Payment method selector. Actual checkout stays disabled until a verified merchant integration is installed.
const payButton = $("#payButton");
$$('input[name="feeMethod"]').forEach(input => input.addEventListener("change", () => {
  payButton.disabled = false;
  $("#paymentFeedback").textContent = "";
}));
payButton.addEventListener("click", () => {
  const method = $("input[name='feeMethod']:checked")?.value;
  if (!method) return;
  if (!SITE_CONFIG.PAYMENT_GATEWAY_READY) {
    $("#paymentFeedback").textContent = "পেমেন্ট গেটওয়ে এখনো সংযুক্ত নয়। অনুমোদিত Merchant API ও সার্ভার-সাইড যাচাই সেটআপের পর এই ধাপ চালু হবে। কোনো ব্যক্তিগত নম্বরে টাকা পাঠাবেন না।";
    return;
  }
  // Add a server-created checkout session here. Never build a payment URL from user input.
  $("#paymentFeedback").textContent = "পেমেন্ট সেশন তৈরির ব্যাকএন্ড এখনো কনফিগার করা হয়নি।";
});

$("#year").textContent = new Date().getFullYear();
