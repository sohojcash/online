/* ShohojCash ↔ Lalcoin Integration
 * Registration and payment are handled by the Lalcoin Laravel backend.
 * No payment secrets, signed URLs or hardcoded gateway URLs are stored here.
 */
const LALCOIN_BASE_URL = "";

// ─── Utility helpers ─────────────────────────────────────────────────────────
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function syncViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--app-vh", `${vh}px`);
  document.documentElement.style.overflowX = "hidden";
  document.body.style.overflowX = "hidden";
}
window.addEventListener("resize", syncViewportHeight);
window.addEventListener("orientationchange", syncViewportHeight);
syncViewportHeight();

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  syncViewportHeight();
}
function closeModal(el) {
  const modal = typeof el === "string" ? document.getElementById(el) : el;
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!$$(".modal-backdrop.is-open").length) document.body.classList.remove("modal-open");
}

// ─── Mobile navigation ────────────────────────────────────────────────────────
$("#menuToggle").addEventListener("click", () => {
  const nav = $("#mainNav");
  const isOpen = nav.classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(isOpen));
});
$$("#mainNav a").forEach(link => link.addEventListener("click", () => {
  $("#mainNav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
}));

// ─── Welcome flow ─────────────────────────────────────────────────────────────
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

// ─── Form helpers ─────────────────────────────────────────────────────────────
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
function selectedValue(name) {
  return $(`input[name="${name}"]:checked`, loanForm)?.value || "";
}

// ─── Form state ───────────────────────────────────────────────────────────────
const loanForm = $("#loanForm");
const statusBox = $("#formStatus");
const submitButton = $("#submitBtn");
let currentApplicationId = null;   // set after successful registration
let isSubmitting = false;
let isPaymentLoading = false;

function showStatus(message, type = "error") {
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`;
}
function restoreSubmitButton() {
  submitButton.disabled = false;
  submitButton.innerHTML = 'আবেদন জমা দিন <span>→</span>';
}

// ─── Collect form data ────────────────────────────────────────────────────────
function collectApplication() {
  const formData = new FormData(loanForm);
  return {
    name:        cleanText(formData.get("name")),
    fatherName:  cleanText(formData.get("fatherName")),
    motherName:  cleanText(formData.get("motherName")),
    dob:         cleanText(formData.get("dob")),
    nid:         toEnglishDigits(cleanText(formData.get("nid"))),
    division:    cleanText(formData.get("division")),
    district:    cleanText(formData.get("district")),
    thana:       cleanText(formData.get("thana")),
    road:        cleanText(formData.get("road")),
    phone:       toEnglishDigits(cleanText(formData.get("phone"))).replace(/[\s-]/g, ""),
    loanType:    selectedValue("loanType"),
    loanAmount:  Number(formData.get("loanAmount")),
    duration:    Number(selectedValue("duration")),
    consent:     Boolean(formData.get("consent")),
    source:      "shohojcash.online",
  };
}

// ─── Client-side validation ───────────────────────────────────────────────────
function validateApplication(data) {
  if (!data.name || !data.fatherName || !data.motherName)
    return "নাম, পিতার নাম ও মাতার নাম পূরণ করুন।";
  if (!validBdPhone(data.phone))
    return "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।";
  if (data.dob && data.dob > new Date().toISOString().slice(0, 10))
    return "জন্ম তারিখ ভবিষ্যতের হতে পারে না।";
  if (!data.loanType)
    return "ঋণের ধরন নির্বাচন করুন।";
  const allowedAmounts = [5000,10000,20000,25000,30000,40000,50000,75000,100000,150000,200000,250000,300000,400000,500000];
  if (!allowedAmounts.includes(data.loanAmount))
    return "সঠিক ঋণের পরিমাণ নির্বাচন করুন।";
  if (![3,6,12].includes(data.duration))
    return "ঋণ পরিশোধের সময় নির্বাচন করুন।";
  if (!data.consent)
    return "তথ্য ব্যবহারের নীতিমালায় সম্মতি দিতে হবে।";
  return "";
}

// ─── Registration submit ──────────────────────────────────────────────────────
loanForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (isSubmitting) return;

  const data = collectApplication();
  const validationMessage = validateApplication(data);
  if (validationMessage) {
    showStatus(validationMessage, "error");
    loanForm.querySelector(":invalid")?.focus({ preventScroll: false });
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "জমা হচ্ছে...";
  showStatus("আপনার আবেদন নিরাপদে জমা দেওয়ার চেষ্টা চলছে...", "success");

  try {
    const response = await fetch(`${LALCOIN_BASE_URL}/lalcoin/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      const serverErrors = result.errors || {};
      const firstError = Object.values(serverErrors)[0];
      showStatus(
        (Array.isArray(firstError) ? firstError[0] : firstError)
          || result.message
          || "আবেদন জমা করা যায়নি। আবার চেষ্টা করুন।",
        "error"
      );
      return;
    }

    currentApplicationId = result.application?.id ?? null;
    showStatus("আপনার আবেদন জমা হয়েছে। নিচে আবেদন ফি-র পরবর্তী ধাপ দেখুন।", "success");
    $("#applicationRef").textContent = `আবেদন নম্বর: ${currentApplicationId || "জমা হয়েছে"}`;
    openModal("paymentModal");

  } catch (err) {
    console.error("Registration error:", err);
    showStatus("নেটওয়ার্ক সমস্যা। ইন্টারনেট সংযোগ পরীক্ষা করুন এবং আবার চেষ্টা করুন।", "error");
  } finally {
    isSubmitting = false;
    restoreSubmitButton();
  }
});

// ─── Payment method selection & submit ───────────────────────────────────────
const payButton = $("#payButton");

$$('input[name="feeMethod"]').forEach(input => input.addEventListener("change", () => {
  payButton.disabled = false;
  $("#paymentFeedback").textContent = "";
}));

payButton.addEventListener("click", async () => {
  if (isPaymentLoading) return;
  const method = $("input[name='feeMethod']:checked")?.value;
  if (!method) {
    $("#paymentFeedback").textContent = "অনুগ্রহ করে একটি পেমেন্ট মাধ্যম নির্বাচন করুন।";
    return;
  }
  if (!currentApplicationId) {
    $("#paymentFeedback").textContent = "আবেদন তথ্য পাওয়া যাচ্ছে না। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।";
    return;
  }

  isPaymentLoading = true;
  payButton.disabled = true;
  payButton.textContent = "পেমেন্ট প্রস্তুত হচ্ছে...";
  $("#paymentFeedback").textContent = "";

  try {
    const response = await fetch(`${LALCOIN_BASE_URL}/lalcoin/applications/init-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        application_id: currentApplicationId,
        method: method,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      $("#paymentFeedback").textContent =
        result.message || "পেমেন্ট শুরু করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।";
      return;
    }

    // Backend provides the signed, server-generated payment URL — navigate to it.
    window.location.href = result.url;

  } catch (err) {
    console.error("Payment init error:", err);
    $("#paymentFeedback").textContent =
      "নেটওয়ার্ক সমস্যা। ইন্টারনেট সংযোগ পরীক্ষা করুন এবং আবার চেষ্টা করুন।";
  } finally {
    isPaymentLoading = false;
    payButton.disabled = false;
    payButton.innerHTML = "টাকা পাঠান";
  }
});

// ─── Footer year ──────────────────────────────────────────────────────────────
$("#year").textContent = new Date().getFullYear();
