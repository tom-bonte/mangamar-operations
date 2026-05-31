/**
 * @file state.js
 * @description Global State Manager. Holds the current date, active view, 
 * and the merged arrays of both Visor (Read-Only) and Internal (Read/Write) trips.
 */

// Core UI State
var currentDate = new Date();
var activeViewMode = 'daily'; // 'daily' or 'monthly'

// Data Streams
var visorTrips = []; // STRICTLY READ-ONLY: Trips fetched from the Visor DB
var internalTrips = []; // READ/WRITE: Mangamar's internal schedule (Naranjito, Cala, etc.)

// The Merged Result used by the UI
var mergedAllocations = []; 

// Active working item for the Guest Management Modal
var activeBoatItem = null;

var customerDatabase = []; // Holds the list of all past customers
var monthlySiteFilters = []; // Remembers which dive sites are selected in Monthly View
var staffDatabase = { capitanes: [], guias: [] }; // Holds Mangamar Staff

// ==========================================
// SESSION AUTHENTICATION
// ==========================================
window.isLoggedIn = false;
window.adminPassword = "manga321";