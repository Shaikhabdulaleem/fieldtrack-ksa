import { Server } from "socket.io";
import { verifyToken } from "../services/auth.service";

export function registerTrackingSocket(io: Server): void {
  const tracking = io.of("/tracking");

  tracking.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));
    try {
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  tracking.on("connection", (socket) => {
    const user = socket.data.user;
    console.log(`[Socket] ${user.role} connected: ${user.sub}`);

    // Admin subscribes to a city room
    socket.on("admin:join-city", (cityId: string) => {
      socket.join(`city:${cityId}`);
    });

    // Driver emits GPS ping → broadcast to admin city room
    socket.on("driver:ping", (data: { lat: number; lng: number; speed?: number; battery?: number }) => {
      if (user.role !== "driver") return;
      tracking.to(`city:${user.cityId}`).emit("driver:location", {
        driverId: user.sub,
        cityId: user.cityId,
        lat: data.lat,
        lng: data.lng,
        speed: data.speed,
        battery: data.battery,
        ts: new Date().toISOString(),
      });
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] disconnected: ${user.sub}`);
    });
  });
}
