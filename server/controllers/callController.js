const { db } = require('../config/db');
const { AccessToken } = require('livekit-server-sdk');

// POST /api/calls/start
const startCall = async (req, res) => {
    const { receiver_id, call_type } = req.body;
    const caller_id = req.user.id;

    try {
        const { data: call, error } = await db
            .from('calls')
            .insert([{
                caller_id,
                receiver_id,
                call_type,
                status: 'ongoing',
                started_at: new Date()
            }])
            .select()
            .single();

        if (error) return res.status(500).json({ message: error.message });
        res.status(201).json(call);
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

// PUT /api/calls/:id/end
const endCall = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'completed', 'missed', 'rejected'

    try {
        const { data: call, error: fetchError } = await db
            .from('calls')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !call) return res.status(404).json({ message: 'Call not found' });

        const ended_at = new Date();
        const duration = Math.floor((ended_at - new Date(call.started_at)) / 1000);

        const { data: updatedCall, error } = await db
            .from('calls')
            .update({
                status: status || 'completed',
                ended_at,
                duration
            })
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ message: error.message });
        res.json(updatedCall);
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};

// POST /api/calls/token
const getCallToken = async (req, res) => {
    const { room, identity } = req.body;
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!apiKey || !apiSecret) {
        return res.status(500).json({ message: 'LiveKit credentials not configured' });
    }

    try {
        const at = new AccessToken(apiKey, apiSecret, {
            identity: identity || req.user.username,
            name: req.user.username,
            ttl: '1h',
        });
        at.addGrant({
            room,
            roomJoin: true,
            canPublish: true,
            canPublishData: true,
            canSubscribe: true,
        });
        const token = await at.toJwt();
        res.json({ token, room });
    } catch (err) {
        res.status(500).json({ message: 'Failed to generate call token' });
    }
};

module.exports = {
    startCall,
    endCall,
    getCallToken
};
