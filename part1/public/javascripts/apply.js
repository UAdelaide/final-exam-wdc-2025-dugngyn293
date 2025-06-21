const { createApp } = Vue;

createApp({
    data() {
        return {
            username: '',
            summary: {
                completed: 0,
                pending: 0,
                totalEarnings: 0
            },
            walkRequests: []
        };
    },

    computed: {
        categorized() {
            const groups = {
                pending: [],
                accepted: [],
                rejected: [],
                completed: []
            };

            for (const req of this.walkRequests) {
                const status = req.application_status;
                const walkStatus = req.walk_status;

                if (!status && walkStatus === 'open') {
                    groups.pending.push(req);
                } else if (status === 'pending') {
                    groups.pending.push(req);
                } else if (status === 'accepted') {
                    groups.accepted.push(req);
                } else if (status === 'rejected') {
                    groups.rejected.push(req);
                } else if (status === 'completed' || walkStatus === 'completed') {
                    groups.completed.push(req);
                }
            }

            return groups;
        }
    },

    methods: {
        async loadUser() {
            try {
                const res = await fetch('/check-auth');
                if (!res.ok) throw new Error();
                const data = await res.json();
                this.username = data.username;
            } catch {
                window.location.href = '/auth.html';
            }
        },

        async loadSummary() {
            try {
                const res = await fetch('/api/walker-summary');
                if (!res.ok) throw new Error();
                this.summary = await res.json();
            } catch (err) {
                console.error('Failed to load summary:', err);
            }
        },

        async loadWalkRequests() {
            try {
                const res = await fetch('/api/walkrequests/available', {
                    credentials: 'include'
                });
                this.walkRequests = await res.json();
            } catch (err) {
                console.error('Failed to load walk requests:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Could not load walk requests',
                    toast: true,
                    position: 'top-end',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        },

        formatDate(date) {
            return new Date(date).toLocaleDateString();
        },

        formatTime(time) {
            return time?.slice(0, 5); // "11:22:00" -> "11:22"
        },

        async applyToRequest(req) {
            try {
                const res = await fetch(`/api/apply/${req.request_id}`, {
                    method: 'POST',
                    credentials: 'include'
                });

                if (res.ok) {
                    req.application_status = 'pending';
                    Swal.fire({
                        icon: 'success',
                        title: 'Applied successfully!',
                        toast: true,
                        timer: 2000,
                        position: 'top-end',
                        showConfirmButton: false
                    });
                } else {
                    const err = await res.json();
                    throw new Error(err.message);
                }
            } catch (err) {
                Swal.fire({
                    icon: 'error',
                    title: err.message || 'Failed to apply',
                    toast: true,
                    timer: 2000,
                    position: 'top-end',
                    showConfirmButton: false
                });
            }
        },

        async completeWalk(req) {
            try {
                const res = await fetch(`/api/complete/${req.request_id}`, {
                    method: 'POST',
                    credentials: 'include'
                });
                const result = await res.json();

                if (res.ok) {
                    req.walk_status = 'completed';
                    req.application_status = 'completed';

                    Swal.fire({
                        icon: 'success',
                        title: '✅ Marked as Completed',
                        toast: true,
                        timer: 2000,
                        position: 'top-end',
                        showConfirmButton: false
                    });

                    this.loadSummary();
                } else {
                    throw new Error(result.message);
                }
            } catch (err) {
                Swal.fire({
                    icon: 'error',
                    title: err.message || 'Failed to complete walk',
                    toast: true,
                    timer: 2000,
                    position: 'top-end',
                    showConfirmButton: false
                });
            }
        }
    },

    mounted() {
        this.loadUser();
        this.loadSummary();
        this.loadWalkRequests();
    }
}).mount('#app');
