export type Category =
  | "Potholes"
  | "Broken Roads"
  | "Water Logging"
  | "Garbage Dump"
  | "Damaged Traffic Signal"
  | "Street Light Not Working"
  | "Drain Blockage"
  | "Fallen Trees"
  | "Others";

export interface AIAnalysis {
  isCivicIssue: boolean;
  category: Category;
  severity: "Low" | "Medium" | "High" | "Critical";
  suggestedTitle: string;
  suggestedDescription: string;
  confidence: number;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  category: Category;
  imageUrl?: string; // base64 or CDN URL
  latitude: number;
  longitude: number;
  status: "Pending" | "In Progress" | "Resolved" | "Rejected";
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string; // ISO String or Fire Timestamp
  upvotesCount: number;
  aiAnalysis?: AIAnalysis;
}

export interface UserSession {
  uid: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
}
