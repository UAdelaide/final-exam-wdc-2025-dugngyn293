// 🐶 Load list of user's dogs into the <select>
async function loadDogsForSelect() {
    try {
        const select = document.getElementById('dogSelect');
        select.innerHTML = '<option disabled selected>Loading dogs...</option>';

        const res = await fetch('/api/my-dogs', {
            method: 'GET',
            credentials: 'include'
        });

        const dogs = await res.json();
        select.innerHTML = '';

        if (!Array.isArray(dogs) || dogs.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'No dogs found';
            option.disabled = true;
            option.selected = true;
            select.appendChild(option);
            return;
        }

        const placeholder = document.createElement('option');
        placeholder.textContent = '-- Select a dog --';
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        dogs.forEach(dog => {
            const option = document.createElement('option');
            option.value = dog.dog_id;
            option.textContent = dog.name;
            select.appendChild(option);
        });

    } catch (err) {
        console.error('🚨 Error loading dogs:', err);
        const select = document.getElementById('dogSelect');
        select.innerHTML = '<option disabled selected>Error loading dogs</option>';
    }
}

// 📅 Toggle form visibility + load dogs
function toggleForm() {
    const form = document.getElementById('walkRequestForm');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        loadDogsForSelect();
    }
}

// 🐾 Load walk requests and display them
async function loadWalkRequests() {
    try {
        const res = await fetch('/api/my-walk-requests', {
            credentials: 'include'
        });

        const requests = await res.json();
        const container = document.getElementById('walkList');
        container.innerHTML = '';

        if (!Array.isArray(requests) || requests.length === 0) {
            container.innerHTML = '<p>No walk requests yet.</p>';
            return;
        }

        for (const req of requests) {
            const walkItem = document.createElement('div');
            walkItem.className = 'walk-item';

            const formattedDate = new Date(req.requested_time).toLocaleString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            let actionHtml = '';

            if (req.status === 'open') {
                if (req.applications && req.applications.length > 0) {
                    actionHtml += `<div class="applicants">`;
                    req.applications.forEach(app => {
                        if (app.status === 'pending') {
                            actionHtml += `
                    <div class="applicant">
                        <span>👤 ${app.username}</span>
                        <button class="btn accept-btn"
                                data-app-id="${app.application_id}"
                                data-request-id="${req.request_id}">
                            Accept
                        </button>
                        <button class="btn reject-btn"
                                data-app-id="${app.application_id}">
                            Reject
                        </button>
                    </div>
                `;
                        }
                    });
                    actionHtml += `</div>`;
                } else {
                    actionHtml = `<span class="tag waiting">Waiting for Applicants</span>`;
                }
            } else if (req.status === 'accepted') {
                actionHtml = `<span class="tag in-progress">In Progress</span>`;
            } else if (req.status === 'completed') {
                actionHtml = `<button class="btn orange rate-btn" data-request-id="${req.request_id}" data-walker-id="${req.walker_id}">Rate Walker</button>`;
            }

            walkItem.innerHTML = `
                <img src="${req.image_url || 'https://place-puppy.com/60x60'}" alt="${req.dog_name}" />
                <div class="walk-info">
                    <strong>${req.dog_name}</strong><br />
                    ${formattedDate}
                </div>
                ${actionHtml}
            `;

            container.appendChild(walkItem);
        }

        // Accept walker handler
        document.querySelectorAll(".accept-btn").forEach(button => {
            button.addEventListener("click", async () => {
                const appId = button.dataset.appId;
                const requestId = button.dataset.requestId;

                try {
                    const res = await fetch('/owner/accept-application', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ application_id: appId, request_id: requestId })
                    });

                    const result = await res.json();
                    if (res.ok) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Walker accepted!',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                        loadWalkRequests();
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: result.message || 'Failed to accept walker.',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2500,
                            timerProgressBar: true
                        });
                    }
                } catch (err) {
                    console.error('Error accepting application:', err);
                    Swal.fire({
                        icon: 'error',
                        title: 'Server error',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 2500,
                        timerProgressBar: true
                    });
                }
            });
        });

        // Rate walker handler
        document.querySelectorAll(".rate-btn").forEach(button => {
            button.addEventListener("click", async () => {
                const requestId = button.dataset.requestId;
                const walkerId = button.dataset.walkerId;

                const { value: rating } = await Swal.fire({
                    title: 'Rate Walker',
                    icon: 'question',
                    input: 'range',
                    inputAttributes: {
                        min: 1,
                        max: 5,
                        step: 1
                    },
                    inputValue: 5,
                    showCancelButton: true,
                    confirmButtonText: 'Submit'
                });

                if (rating) {
                    try {
                        const res = await fetch('/api/rate-walker', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ request_id: requestId, walker_id: walkerId, rating: parseInt(rating) })
                        });

                        const result = await res.json();

                        if (res.ok) {
                            Swal.fire({
                                icon: 'success',
                                title: 'Thank you for rating!',
                                toast: true,
                                position: 'top-end',
                                timer: 2000,
                                showConfirmButton: false
                            });
                            button.disabled = true;
                            button.textContent = 'Rated';
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: result.message || 'Failed to submit rating',
                                toast: true,
                                position: 'top-end',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        }
                    } catch (err) {
                        console.error('Rating error:', err);
                        Swal.fire({
                            icon: 'error',
                            title: 'Server error',
                            toast: true,
                            position: 'top-end',
                            timer: 2000,
                            showConfirmButton: false
                        });
                    }
                }
            });
        });

    } catch (err) {
        console.error('Error loading walk requests:', err);
        document.getElementById('walkList').innerHTML = '<p>Error loading walk requests.</p>';
    }
}

// 🚀 Handle form submit
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById('walkRequestForm');
    const message = document.getElementById('walkMessage');

    loadWalkRequests();

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const dog_id = document.getElementById('dogSelect').value;
        const datetime = document.getElementById('datetime').value;
        const duration = document.getElementById('duration').value;
        const location = document.getElementById('location').value;

        if (!dog_id || !datetime || !duration || !location) {
            message.style.color = 'red';
            message.textContent = 'Please fill in all fields.';
            return;
        }

        try {
            const res = await fetch('/owner/walk-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ dog_id, datetime, duration, location })
            });

            const result = await res.json();

            if (res.ok) {
                message.style.color = 'green';
                message.textContent = result.message || 'Walk request created!';
                form.reset();
                form.classList.add('hidden');
                loadWalkRequests();
            } else {
                message.style.color = 'red';
                message.textContent = result.error || 'Failed to submit walk request.';
            }
        } catch (err) {
            console.error('❌ Submit error:', err);
            message.style.color = 'red';
            message.textContent = 'Server error. Try again.';
        }
    });
});
