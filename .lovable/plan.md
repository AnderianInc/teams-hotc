

# Church Children's Check-In App — `checkin.hotc.life`

## Overview
A fast, offline-capable check-in kiosk app for children's ministry at HOTC. Admins manage volunteers, rooms, and settings. Volunteers log in to search/register children and print name tags wirelessly to a Brother label printer.

---

## Authentication & Roles

### Login Page
- Email/password login for all users (admin and volunteers)
- "Forgot password" link for password reset

### Admin Features
- **Invite volunteers** — Admin enters a volunteer's email, they receive an invite link to set up their password
- **Manage volunteers** — View, deactivate, or remove volunteer accounts
- **Everything volunteers can do** — Admin can also search, register kids, and check them in

### Volunteer Features
- Log in and go straight to the check-in screen
- Search, register children, and print tags

---

## Pages & Flow

### 1. Login Page
- Email + password form
- Redirects to Check-In Home after login

### 2. Check-In Home (Search)
- Large search bar — search by child name, family name, or parent phone number
- Results appear instantly as you type
- Each result shows child name, age/grade, and parent name
- Tap a child → Check-In Confirmation
- "Register New Child" button if no match found

### 3. Register New Child
- Form captures:
  - **Child:** First name, last name, date of birth, grade/age group
  - **Medical:** Allergies, medical notes
  - **Parent/Guardian:** Parent name(s), phone number(s)
- On save → automatically proceeds to check-in

### 4. Check-In Confirmation
- Shows child's name, auto-assigned room (by age/grade), and allergy flags
- Volunteer taps **"Check In & Print Tag"**
- Tag sent to connected Brother printer
- Success screen → back to search for next child

### 5. Settings (Admin only)
- **Volunteer management** — Invite new volunteers, view/remove existing ones
- **Room/class configuration** — Define rooms with age/grade ranges (e.g., "Nursery: 0-2", "Pre-K: 3-5")
- **Printer setup** — Discover and connect to a Brother printer via Wi-Fi or Bluetooth
- **Service management** — Create/select the current service session

---

## Name Tag Content
- Child's first & last name
- Assigned room/class name
- Allergy/medical flag (if applicable)
- Date and service time

---

## Key Technical Features

### Offline Support
- All child and family data cached locally so search and registration work without internet
- Check-ins recorded locally and synced when back online

### Printer Integration
- Connect to Brother label printers over Wi-Fi or Bluetooth
- Print name tags directly from the check-in confirmation screen

### Backend (Supabase)
- User authentication with role-based access (admin / volunteer)
- Database for children, families, rooms, check-in records
- Invite-based volunteer onboarding

---

## Scale
- Optimized for 30–100 children per service
- Fast search with instant results

