<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CommunityController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\LostPetController;
use App\Http\Controllers\MedicationController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PetController;
use App\Http\Controllers\ReminderController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// ── Health ──────────────────────────────────────────────────────────────────
Route::get('/health', fn () => response()->json(['status' => 'ok', 'version' => '1.0.0']));

// ── Auth (public, rate-limited to blunt brute-force) ─────────────────────────
Route::middleware('throttle:20,1')->group(function () {
    Route::post('/auth/signup', [AuthController::class, 'signup']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/refresh', [AuthController::class, 'refresh']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
});

// ── Authenticated ───────────────────────────────────────────────────────────
Route::middleware('auth.jwt')->group(function () {
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

    // Lost pets (community alerts)
    Route::get('/lost-pets', [LostPetController::class, 'index']);
    Route::get('/lost-pets/mine', [LostPetController::class, 'mine']);
    Route::post('/pets/{pet}/lost-report', [LostPetController::class, 'report'])->middleware('throttle:10,1');
    Route::patch('/lost-pets/{report}/resolve', [LostPetController::class, 'resolve']);
    Route::delete('/pets/{pet}/foods/{food}', [PetController::class, 'deleteFood']);

    // Community
    Route::get('/community/posts', [CommunityController::class, 'listPosts']);
    Route::post('/community/posts', [CommunityController::class, 'createPost']);
    Route::delete('/community/posts/{post}', [CommunityController::class, 'deletePost']);
    Route::post('/community/posts/{post}/paw', [CommunityController::class, 'togglePaw']);
    Route::get('/community/posts/{post}/comments', [CommunityController::class, 'listComments']);
    Route::post('/community/posts/{post}/comments', [CommunityController::class, 'addComment']);
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
