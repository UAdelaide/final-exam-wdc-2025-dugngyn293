document.addEventListener("DOMContentLoaded", async () => {
    const usernameEl = document.getElementById("username");
    const dogCardsContainer = document.getElementById("dogCardsContainer");
    const dogFormEl = document.getElementById("dogForm");
    const dogNameInput = document.getElementById("dogName");
    const dogSizeInput = document.getElementById("dogSize");

    let dogs = [];

    async function checkAuthAndInit() {
        try {
            const res = await fetch('/check-auth');
            const data = await res.json();
            usernameEl.textContent = data.username;
            await loadDogs();
        } catch (err) {
            window.location.href = '/auth.html';
        }
    }

    async function getRandomDogImage() {
        try {
            const res = await fetch('https://dog.ceo/api/breeds/image/random');
            const data = await res.json();
            return data.message;
        } catch {
            return `https://loremflickr.com/80/80/dog?random=${Math.floor(Math.random() * 1000)}`;
        }
    }

    async function loadDogs() {
        try {
            const res = await fetch('/api/my-dogs', { credentials: 'include' });
            dogs = await res.json();

            for (const dog of dogs) {
                dog.image_url = await getRandomDogImage();
            }

            renderDogCards();
        } catch (err) {
            console.error('Failed to load dogs:', err);
            Swal.fire({
                icon: 'error',
                title: 'Failed to load your dogs.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
        }
    }

    function renderDogCards() {
        dogCardsContainer.innerHTML = '';
        dogs.forEach(dog => {
            const card = document.createElement('div');
            card.className = 'dog-card';

            card.innerHTML = `
                <img src="${dog.image_url}" alt="Dog" />
                <div>${dog.name} (${dog.size})</div>
                <button class="btn red">Delete</button>
            `;

            card.querySelector('button').addEventListener('click', () => deleteDog(dog.dog_id));
            dogCardsContainer.appendChild(card);
        });

        // Add button
        const addBtn = document.createElement('div');
        addBtn.className = 'dog-card add-dog';
        addBtn.innerHTML = `<span>+</span><div>Add Dog</div>`;
        addBtn.addEventListener('click', toggleDogForm);
        dogCardsContainer.appendChild(addBtn);
    }

    async function deleteDog(dogId) {
        const dog = dogs.find(d => d.dog_id === dogId);

        const confirm = await Swal.fire({
            title: `Remove ${dog.name}?`,
            text: "You won't be able to revert this!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#e74c3c',
            cancelButtonColor: '#aaa',
            confirmButtonText: 'Yes, remove it!'
        });

        if (!confirm.isConfirmed) return;

        try {
            const res = await fetch(`/api/delete-dog/${dogId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (res.ok) {
                dogs = dogs.filter(d => d.dog_id !== dogId);
                renderDogCards();
                Swal.fire({
                    icon: 'success',
                    title: `${dog.name} removed.`,
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
            } else {
                throw new Error();
            }
        } catch (err) {
            console.error('Failed to delete dog:', err);
            Swal.fire({
                icon: 'error',
                title: 'Failed to remove dog.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });
        }
    }

    function toggleDogForm() {
        dogFormEl.classList.toggle('hidden');
    }

    dogFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = dogNameInput.value.trim();
        const size = dogSizeInput.value;

        if (!name || !size) {
            Swal.fire('Missing Info', 'Please fill in all fields.', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/add-dog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, size })
            });

            const result = await res.json();

            if (res.ok) {
                const image_url = await getRandomDogImage();
                dogs.push({ dog_id: result.dog_id, name, size, image_url });
                dogFormEl.reset();
                dogFormEl.classList.add('hidden');
                renderDogCards();

                Swal.fire({
                    icon: 'success',
                    title: 'Dog added successfully!',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: result.error || 'Something went wrong!',
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000
                });
            }
        } catch (err) {
            console.error('Add error:', err);
            Swal.fire('Error', 'Server error while adding dog.', 'error');
        }
    });

    checkAuthAndInit();
});
