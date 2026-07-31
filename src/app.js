/**
 * CorporateHR Information System (CHRIS)
 * Version: 1.0.0
 */

document.addEventListener("DOMContentLoaded", () => {
    console.log("CHRIS Platform Started");

    const app = document.getElementById("app");

    if (app) {
        app.innerHTML = `
            <div class="welcome">
                <h1>CorporateHR Information System (CHRIS)</h1>
                <p>Enterprise Human Resource Information System</p>

                <h2>Coming Modules</h2>

                <ul>
                    <li>Dashboard</li>
                    <li>Employee Management</li>
                    <li>Recruitment</li>
                    <li>Payroll</li>
                    <li>Leave Management</li>
                    <li>Loan Management</li>
                    <li>Training & Learning</li>
                    <li>Reports & Analytics</li>
                </ul>
            </div>
        `;
    }
});
