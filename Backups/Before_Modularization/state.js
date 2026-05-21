/**
 * @file state.js
 * @description Global State Manager. Holds the current date, active view, 
 * and the merged arrays of both Visor (Read-Only) and Internal (Read/Write) trips.
 */

// Core UI State
let currentDate = new Date();
let activeViewMode = 'daily'; // 'daily' or 'monthly'

// Data Streams
let visorTrips = []; // STRICTLY READ-ONLY: Trips fetched from the Visor DB
let internalTrips = []; // READ/WRITE: Mangamar's internal schedule (Naranjito, Cala, etc.)

// The Merged Result used by the UI
let mergedAllocations = []; 

// Active working item for the Guest Management Modal
let activeBoatItem = null;

let customerDatabase = []; // Holds the list of all past customers
let monthlySiteFilters = []; // Remembers which dive sites are selected in Monthly View
let staffDatabase = { capitanes: [], guias: [] }; // Holds Mangamar Staff

// ==========================================
// SESSION AUTHENTICATION
// ==========================================
window.isLoggedIn = false;
window.adminPassword = "manga321";