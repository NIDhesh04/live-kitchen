const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const SECRET_KEY = "my-super-secret-key-123"; // In a real job, hide this in .env!

// Enable mongoose debug mode to see what's happening
mongoose.set('debug', true);

const app = express();
app.use(express.json());
app.use(cors());

// SMART CONNECTION STRING
// 1. Look for 'DB_URI' in the environment (Render)
// 2. If not found, use the hardcoded string (Local Laptop)
const mongoUri = process.env.DB_URI || 'mongodb+srv://nidheshsoni_db_user:pass123@cluster0.fnbr4ju.mongodb.net/ordersDB?retryWrites=true&w=majority';
mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 75000
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => {
    console.error('❌ Full Error Details:');
    console.error('Message:', err.message);
    console.error('Name:', err.name);
    console.error('Reason:', err.reason);
    if (err.reason && err.reason.servers) {
        err.reason.servers.forEach((server, host) => {
            console.error(`\nServer: ${host}`);
            console.error('Error:', server.error);
        });
    }
});

// Rest of your code...
const orderSchema = new mongoose.Schema({
    item: String,
    customerName: String,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

io.on('connection', (socket) => {
    console.log('⚡ A user connected via WebSockets:', socket.id);
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});
// --- AUTHENTICATION ---

// 1. Login Route: User sends Password -> Server gives Token
app.post('/login', (req, res) => {
    const { password } = req.body;
    
    // Simple hardcoded password check
    if(password === "chef123") {
        // Create the badge (valid for 1 hour)
        const token = jwt.sign({ role: 'kitchen' }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: "Wrong Password" });
    }
});

// 2. Middleware: The Security Guard
// We put this BEFORE any route we want to protect
const requireAuth = (req, res, next) => {
    const token = req.headers['authorization']; // Look for badge in headers
    
    if(!token) return res.status(403).json({ error: "No token provided" });

    try {
        jwt.verify(token, SECRET_KEY); // Check if badge is fake
        next(); // It's real! Let them pass.
    } catch(err) {
        res.status(401).json({ error: "Invalid Token" });
    }
}

app.get('/orders', async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
});

app.post('/orders', async (req, res) => {
    const { item, customerName } = req.body;
    const newOrder = new Order({ item, customerName });
    await newOrder.save();
    io.emit('order_updated', newOrder);
    res.status(201).json(newOrder);
});

app.patch('/orders/:id',requireAuth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updatedOrder = await Order.findByIdAndUpdate(id, { status }, { new: true });
    io.emit('order_updated', updatedOrder);
    res.json(updatedOrder);
});
app.delete('/orders/:id' , requireAuth , async(req,res)=>{
    const {id} = req.params;
    await Order.findByIdAndDelete(id);
    console.log(`📢 BROADCASTING DELETE FOR ID: ${id}`);
    io.emit('order deleted' , id);
    res.json({success : true});
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});