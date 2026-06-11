<?php

use App\Http\Controllers\AppointmentController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClinicController;
use App\Http\Controllers\CommunityController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\LostPetController;
use App\Http\Controllers\MedicationController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PetController;
use App\Http\Controllers\PetSharingController;
use App\Http\Controllers\ReminderController;
use App\Http\Controllers\UploadController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// ── Health ──────────────────────────────────────────────────────────────────
Route::get('/health', fn () => response()->json(['status' => 'ok', 'version' => '1.0.0']));

// ── Signed document delivery (no JWT — the signature is the authorization) ────
// The URL is minted only for users with pet access via /pets/{pet}/documents/{id}/url
// and expires within minutes, so a leaked link can't grant lasting access.
Route::get('/documents/{document}/raw', [DocumentController::class, 'raw'])
    ->middleware('signed')
    ->name('documents.raw');

// ── Auth (public, rate-limited to blunt brute-force) ─────────────────────────
Route::middleware('throttle:20,1')->group(function () {
    Route::post('/auth/signup', [AuthController::class, 'signup']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/refresh', [AuthController::class, 'refresh']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
});

// ── Authenticated ───────────────────────────────────────────────────────────
Route::middleware('auth.jwt')->group(function () {
    // Uploads (images)
    Route::post('/uploads', [UploadController::class, 'store'])->middleware('throttle:30,1');

    // Users
    Route::get('/users/me', [UserController::class, 'me']);
    Route::patch('/users/me', [UserController::class, 'update']);

    // Pets
    Route::get('/pets', [PetController::class, 'index']);
    Route::post('/pets', [PetController::class, 'store']);
    Route::get('/pets/{pet}', [PetController::class, 'show']);
    Route::patch('/pets/{pet}', [PetController::class, 'update']);
    Route::delete('/pets/{pet}', [PetController::class, 'destroy']);

    // Vaccinations
    Route::get('/pets/{pet}/vaccinations', [PetController::class, 'listVaccinations']);
    Route::post('/pets/{pet}/vaccinations', [PetController::class, 'addVaccination']);
    Route::patch('/pets/{pet}/vaccinations/{vax}/complete', [PetController::class, 'completeVaccination']);
    Route::delete('/pets/{pet}/vaccinations/{vax}', [PetController::class, 'deleteVaccination']);

    // Medications
    Route::get('/pets/{pet}/medications', [MedicationController::class, 'index']);
    Route::post('/pets/{pet}/medications', [MedicationController::class, 'store']);
    Route::patch('/pets/{pet}/medications/{medication}', [MedicationController::class, 'update']);
    Route::delete('/pets/{pet}/medications/{medication}', [MedicationController::class, 'destroy']);
    Route::post('/pets/{pet}/medications/{medication}/log', [MedicationController::class, 'logDose']);

    // Activities
    Route::get('/pets/{pet}/activities', [PetController::class, 'listActivities']);
    Route::post('/pets/{pet}/activities', [PetController::class, 'addActivity']);
    Route::delete('/pets/{pet}/activities/{activity}', [PetController::class, 'deleteActivity']);

    // Favorite foods
    Route::get('/pets/{pet}/foods', [PetController::class, 'listFoods']);
    Route::post('/pets/{pet}/foods', [PetController::class, 'addFood']);
    Route::delete('/pets/{pet}/foods/{food}', [PetController::class, 'deleteFood']);

    // Weight history
    Route::get('/pets/{pet}/weights', [PetController::class, 'listWeights']);
    Route::post('/pets/{pet}/weights', [PetController::class, 'addWeight']);
    Route::delete('/pets/{pet}/weights/{weight}', [PetController::class, 'deleteWeight']);

    // Expenses
    Route::get('/pets/{pet}/expenses', [PetController::class, 'listExpenses']);
    Route::post('/pets/{pet}/expenses', [PetController::class, 'addExpense']);
    Route::delete('/pets/{pet}/expenses/{expense}', [PetController::class, 'deleteExpense']);

    // Pet sharing (co-owners)
    Route::get('/pets/{pet}/members', [PetSharingController::class, 'members']);
    Route::post('/pets/{pet}/invites', [PetSharingController::class, 'invite'])->middleware('throttle:20,1');
    Route::delete('/pets/{pet}/invites/{invite}', [PetSharingController::class, 'cancelInvite']);
    Route::delete('/pets/{pet}/members/{member}', [PetSharingController::class, 'removeMember']);
    Route::post('/pets/{pet}/leave', [PetSharingController::class, 'leave']);

    // Invitations addressed to the current user
    Route::get('/invites', [PetSharingController::class, 'listInvites']);
    Route::post('/invites/{invite}/accept', [PetSharingController::class, 'accept']);
    Route::post('/invites/{invite}/decline', [PetSharingController::class, 'decline']);

    // Medical records vault — clinics, appointments, documents
    Route::get('/pets/{pet}/clinics', [ClinicController::class, 'index']);
    Route::post('/pets/{pet}/clinics', [ClinicController::class, 'store']);
    Route::patch('/pets/{pet}/clinics/{clinic}', [ClinicController::class, 'update']);
    Route::delete('/pets/{pet}/clinics/{clinic}', [ClinicController::class, 'destroy']);

    Route::get('/pets/{pet}/appointments', [AppointmentController::class, 'index']);
    Route::post('/pets/{pet}/appointments', [AppointmentController::class, 'store']);
    Route::patch('/pets/{pet}/appointments/{appointment}', [AppointmentController::class, 'update']);
    Route::delete('/pets/{pet}/appointments/{appointment}', [AppointmentController::class, 'destroy']);

    Route::get('/pets/{pet}/documents', [DocumentController::class, 'index']);
    Route::post('/pets/{pet}/documents', [DocumentController::class, 'store'])->middleware('throttle:30,1');
    Route::get('/pets/{pet}/documents/{document}/url', [DocumentController::class, 'url']);
    // AI intake — expensive model call, so throttled tighter than other routes.
    Route::post('/pets/{pet}/documents/{document}/extract', [DocumentController::class, 'extract'])->middleware('throttle:10,1');
    Route::delete('/pets/{pet}/documents/{document}', [DocumentController::class, 'destroy']);

    // Lost pets (community alerts)
    Route::get('/lost-pets', [LostPetController::class, 'index']);
    Route::get('/lost-pets/mine', [LostPetController::class, 'mine']);
    Route::post('/pets/{pet}/lost-report', [LostPetController::class, 'report'])->middleware('throttle:10,1');
    Route::patch('/lost-pets/{report}/resolve', [LostPetController::class, 'resolve']);

    // Community
    Route::get('/community/posts', [CommunityController::class, 'listPosts']);
    Route::post('/community/posts', [CommunityController::class, 'createPost']);
    Route::delete('/community/posts/{post}', [CommunityController::class, 'deletePost']);
    Route::post('/community/posts/{post}/paw', [CommunityController::class, 'togglePaw']);
    Route::get('/community/posts/{post}/comments', [CommunityController::class, 'listComments']);
    Route::post('/community/posts/{post}/comments', [CommunityController::class, 'addComment'])->middleware('throttle:30,1');
    Route::delete('/community/posts/{post}/comments/{comment}', [CommunityController::class, 'deleteComment']);
    Route::get('/community/groups', [CommunityController::class, 'listGroups']);
    Route::post('/community/groups/{group}/join', [CommunityController::class, 'toggleGroup']);

    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index']);

    // Devices (push token registration)
    Route::post('/devices', [DeviceController::class, 'store']);
    Route::delete('/devices', [DeviceController::class, 'destroy']);

    // Reminders
    Route::get('/reminders', [ReminderController::class, 'index']);
    Route::post('/reminders', [ReminderController::class, 'store']);
    Route::patch('/reminders/{reminder}', [ReminderController::class, 'update']);
    Route::delete('/reminders/{reminder}', [ReminderController::class, 'destroy']);

    // Notification center (reminder deliveries)
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'read']);
    Route::post('/notifications/{notification}/snooze', [NotificationController::class, 'snooze']);
    Route::post('/notifications/{notification}/dismiss', [NotificationController::class, 'dismiss']);
});
