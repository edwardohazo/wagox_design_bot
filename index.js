import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import Groq from "groq-sdk";

dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 5000; // Use the port from .env or default to 3000

// Middleware
app.use(express.json());
const allowedOrigins = ['https://wagox-design.netlify.app']; // On Production
// const allowedOrigins = ['http://127.0.0.1']; // On Development

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],  // Add other methods if needed
  allowedHeaders: ['Content-Type', 'Authorization'], // Add headers if needed
};

app.use(cors(corsOptions)); // On production ***
// app.use(cors()); // On Development ***

// Environment variables
const GROQ_API_BASE_URL = process.env.GROQ_API_BASE_URL; // Set in .env
const GROQ_API_KEY = process.env.GROQ_API_KEY;           // Set in .env

const groq = new Groq({ apiKey: GROQ_API_KEY });

if (!GROQ_API_BASE_URL || !GROQ_API_KEY) {
  console.error("Error: GROQ_API_BASE_URL and GROQ_API_KEY must be set in the .env file.");
  process.exit(1);
}

// In-memory conversation storage
const conversations = {};

// Default context for the bot (Information about the person)
const defaultContext = [
  {
    role: "system",
    content: "You are a professional, friendly, and helpful virtual assistant representing a creative digital agency based in Guadalajara, Jalisco, México. Always respond on english, unless the user writes in another language. Respond clearly and kindly, offering useful information about the agency’s services. You are here to help potential clients, collaborators, or anyone interested in web development or digital marketing."
  },
  {
    role: "system",
    content: "The agency was founded in June 2023 and specializes in custom-coded websites, WordPress development, and digital marketing. We’re passionate about building high-quality web experiences tailored to the specific needs of each client."
  },
  {
    role: "system",
    content: "### Services we offer:\n\n**1. Business Websites**\n- Professional websites tailored for businesses.\n- Custom designs that match your brand identity.\n- Mobile-responsive and SEO-optimized for better reach.\n- Fast loading times to enhance user experience.\n- Integrations for smooth customer interactions.\n\n**2. E-commerce**\n- Fully functional e-commerce websites for selling products online.\n- Secure payment gateway integrations.\n- User-friendly shopping experience with easy navigation.\n- Product inventory management and order tracking system.\n- Customizable shopping carts and checkout processes.\n\n**3. Landing Pages**\n- Optimized landing pages designed to convert visitors.\n- Focused content and strong calls-to-action to increase engagement.\n- High-performance pages that load quickly on all devices.\n- Integration with analytics to track visitor behavior.\n- Customizable design options to fit any brand or campaign.\n\n**4. Portfolio Sites**\n- Showcase your work with a professional portfolio website.\n- Customizable galleries and layouts to highlight your projects.\n- Easy navigation and seamless user experience.\n- Mobile-friendly design to display your work on all devices.\n- Contact forms and social media integrations to connect with potential clients."
  },
  {
    role: "system",
    content: "Users can use the **price quoter available on our website** to get an instant estimate of project costs based on their selected services and options. It’s a quick and easy way to plan your project budget."
  },
  {
    role: "system",
    content: "If users prefer to talk directly with someone from the team, they can always **send us an email**, and a representative will get in touch to provide personalized assistance."
  },
  {
    role: "system",
    content: "If a user asks about something unrelated to our company or outside of our services, respond with: 'Lo siento, solo puedo ayudarte con información sobre nuestros servicios o nuestra empresa.'"
  }
];

// Function to communicate with the GROQ API
async function getGroqChatCompletion(context) {
  return groq.chat.completions.create({
    messages: context,
    model: "llama-3.3-70b-versatile",
  });
}

app.post("/api/prompt", async (req, res) => {
  const { prompt, userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId is required to track conversations." });
  }

  try {
    // Initialize or retrieve the user's conversation history
    if (!conversations[userId]) {
      conversations[userId] = [];
    }

    const userConversation = conversations[userId];
    userConversation.push({ role: "user", content: prompt });

    const context = [...defaultContext, ...userConversation];

    const chatCompletion = await getGroqChatCompletion(context);

    if (!chatCompletion) {
      return res.status(500).json({ error: "Failed to get a response from the GROQ API." });
    }

    const botResponse = chatCompletion.choices[0].message.content;
    userConversation.push({ role: "assistant", content: botResponse });

    res.json({ prompt, botResponse });
  } catch (error) {
    console.error("Error interacting with GROQ API:", error);
    res.status(500).json({ error: "An internal error occurred." });
  }
});

// WebSocket server for chat communication
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Web Sockets Conection
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("New client connected");
  ws.on("message", async (message) => {
    const { userId, prompt } = JSON.parse(message);
    console.log(`Received message from user ${userId}: ${prompt}`);
    try {
      // const response = await fetch("http://localhost:" + PORT + "/api/prompt", {   // On development ***
        const response = await fetch("https://wagox-design-bot.onrender.com/api/prompt", {  // On Production ***
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, userId }),
      });
      if (!response.ok) throw new Error("Server error");
      const data = await response.json();
      ws.send(JSON.stringify({ botResponse: data.botResponse }));
    } catch (error) {
      console.error(error);
      ws.send(JSON.stringify({ botResponse: `Error processing request` }));
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});      
