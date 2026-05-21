const axios = require('axios');

async function runTest() {
    const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
    console.log('--- Starting Payment Flow Integration Test ---');
    
    // Create an axios instance that maintains cookies/session
    // Axios doesn't automatically store cookies in node, so we use a simple header/cookie jar logic
    let cookie = '';
    
    const client = axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    // Intercept responses to extract cookies
    client.interceptors.response.use(res => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
            cookie = setCookie.map(c => c.split(';')[0]).join('; ');
        }
        return res;
    });

    // Intercept requests to attach cookies
    client.interceptors.request.use(config => {
        if (cookie) {
            config.headers['Cookie'] = cookie;
        }
        return config;
    });

    try {
        // 1. Get Me (initial session creation as guest)
        console.log('1. Checking user session...');
        let meRes = await client.get('/api/auth/me');
        let currentUser = meRes.data;
        console.log('   Logged in as:', currentUser.display_name, '(ID:', currentUser.id, ')');

        // 2. Try to get active packages (should be empty initially)
        console.log('2. Fetching active packages...');
        let activeRes = await client.get('/api/payment/active-packages');
        console.log('   Active packages before:', activeRes.data);

        // 3. Create payment invoice for tryout
        console.log('3. Creating payment invoice...');
        const createRes = await client.post('/api/payment/create', {
            packageId: 'bulanan',
            email: 'test-student@itb.ac.id',
            name: 'Test Student'
        });
        
        const { merchantOrderId, paymentUrl, reference } = createRes.data;
        console.log('   Invoice Created successfully!');
        console.log('   Order ID:', merchantOrderId);
        console.log('   Reference:', reference);
        console.log('   Payment URL (Mock):', paymentUrl);

        // 4. Check initial status (should be PENDING)
        console.log('4. Checking payment status (initial)...');
        let statusRes = await client.get(`/api/payment/status/${merchantOrderId}`);
        console.log('   Status:', statusRes.data.status);
        if (statusRes.data.status !== 'PENDING') {
            throw new Error('Initial status should be PENDING');
        }

        // 5. Simulate payment success using mock-complete endpoint
        console.log('5. Simulating payment completion (SUCCESS)...');
        // Extract query parameters from mock completion redirect path or directly trigger completion
        // /api/payment/mock-complete?merchantOrderId=...&status=success
        await client.get(`/api/payment/mock-complete?merchantOrderId=${merchantOrderId}&status=success`, {
            maxRedirects: 0,
            validateStatus: () => true // Don't throw on redirect
        });
        console.log('   Completion simulated.');

        // 6. Check updated status (should be SUCCESS)
        console.log('6. Checking updated payment status...');
        statusRes = await client.get(`/api/payment/status/${merchantOrderId}`);
        console.log('   Status:', statusRes.data.status);
        if (statusRes.data.status !== 'SUCCESS') {
            throw new Error('Updated status should be SUCCESS');
        }

        // 7. Verify active packages lists our tryout
        console.log('7. Verifying active packages now lists the purchased tryout...');
        activeRes = await client.get('/api/payment/active-packages');
        console.log('   Active packages after:', activeRes.data);
        if (!activeRes.data.includes('Bulanan')) {
            throw new Error('Active packages must include "Bulanan"');
        }

        console.log('\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.response?.data || error.message);
        process.exit(1);
    }
}

runTest();
