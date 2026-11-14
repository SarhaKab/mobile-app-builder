#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
agent_communication:
  - agent: "main"
    message: "Merged GitHub branch kfit-supabase (user's own code). Auth switched from backend JWT to Supabase Auth (email+password) in frontend/src/supabase.ts, src/auth.tsx, app/login.tsx; backend current_user() now also accepts Supabase access tokens (supabase_user_id). Google button removed. Supabase project requires e-mail confirmation (mailer_autoconfirm=false) and no confirmed Supabase test account exists, so a successful sign-in cannot be tested yet. Needs testing: sign-up -> confirm-email screen, login error states, backend token rejection, legacy endpoints."
  - agent: "main"
    message: "Iteration 2: pulled commit f46f2a2 (maps email_address_invalid/validation_failed -> authErr_email_invalid, network failures -> authErr_network). User created a CONFIRMED Supabase account; credentials in backend/.env (KFIT_TEST_EMAIL / KFIT_TEST_PASSWORD). Needs testing: successful sign-in, session persistence, logout, backend acceptance of real Supabase token, main screens after login, new error messages."
  - agent: "main"
    message: "Iteration 3 (security fixes after audit). SEC-001: removed legacy /api/auth/register, /api/auth/login, /api/auth/session and all legacy JWT / session-token acceptance in current_user(); backend now accepts ONLY Supabase tokens. SEC-002: per-user AI limits via ai_quota() + Mongo collection ai_usage — coach 5/min & 50/day, nutrition 2/min & 5/day, HTTP 429 with message translated in user's lang; coach screen shows that message (frontend/src/api.ts streamChat + app/(tabs)/coach.tsx). Old tests relying on legacy login are now obsolete."
  - agent: "main"
    message: "Iteration 4: KFIT HOME moved to Supabase (src/home.ts, training tab catalogue, program/video/exercise detail, history, favorites, enrollment), contact details screen (/contact), role badge + admin-only content management (/admin, /admin/edit, sample loader in src/sample-content.ts). Self smoke test: empty catalogue + contact validation/save OK. Content and admin flows need an admin account."
  - agent: "main"
    message: "Iteration 5: exercise sheets per level (exercises.level_variants), translated muscle/equipment codes, VideoPlayer (expo-video, signed URLs from private bucket 'videos'), draft videos (path prefix drafts/) visible to admins only with approve/remove in admin edit, admin form for level variants. 3 AI videos uploaded as drafts for sample-push-ups, sample-goblet-squat, sample-plank. Self-tested: exercise sheet + player + level chips."
  - agent: "main"
    message: "Iteration 6: narrated + subtitled exercise videos per account language. Storage: <stem>.mp4 (silent), <stem>.<lang>.mp4 (voice-over), <stem>.<lang>.json (cues). VideoPlayer picks lang, shows synced subtitles (toggle), falls back to silent loop. approve/remove now move/delete all variants. Generated for sample-push-ups, sample-goblet-squat, sample-plank (drafts). Self-tested FR/EN playback + subtitles."
