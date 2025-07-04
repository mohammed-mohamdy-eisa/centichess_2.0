$(document).ready(async () => {
    // Navigation toggle functionality
    const toggleElement = (elem) => elem.classList.toggle("active");
    const navToggleBtn = document.querySelector("[data-nav-toggle-btn]");
    const navbar = document.querySelector("[data-navbar]");
    const overlay = document.querySelector("[data-overlay]");

    const toggleNav = () => {
        toggleElement(navToggleBtn);
        toggleElement(navbar);
        toggleElement(document.body);
        overlay.classList.toggle("active");
    };

    navToggleBtn.addEventListener("click", toggleNav);
    overlay.addEventListener("click", toggleNav);
});