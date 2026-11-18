
import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";

// ==========================================
// PUBLIC PAGES
// ==========================================

import Login from "./pages/Login";
import Register from "./pages/Register";

// ==========================================
// DASHBOARD
// ==========================================

import Home from "./pages/Home";

// ==========================================
// REVIEWERS
// ==========================================

import CreateReviewer from "./routes/_authed/create";
import ReviewersPage from "./routes/_authed/reviewers.index";
import ReviewerPage from "./routes/_authed/reviewers.$reviewerId";
import EditReviewerPage from "./routes/_authed/reviewers.$reviewerId._edit";

// ==========================================
// MATERIALS
// ==========================================

import MaterialsPage from "./routes/_authed/materials";

// ==========================================
// FLASHCARDS
// ==========================================

import FlashcardsPage from "./routes/_authed/flashcards.index";
import FlashcardSetPage from "./routes/_authed/flashcards.$setId";
import StudyPage from "./routes/_authed/flashcards.$setId.study";

// ==========================================
// QUIZZES
// ==========================================

import QuizzesPage from "./routes/_authed/quizzes.index";
import QuizPage from "./routes/_authed/quizzes.$quizId";

// ==========================================
// PROFILE
// ==========================================

import ProfilePage from "./routes/_authed/profile";

// ==========================================
// GLOBAL CSS
// ==========================================

// Main app styles
import "./App.css";

// Mobile responsive fixes
import "./styles/studyroom-mobile-fix.css";

// Light / Dark mode overrides
// Always import this last.
import "./styles/studyroom-theme.css";

// ==========================================
// MAIN APPLICATION
// ==========================================

export default function App() {
  return (
    <Routes>

      {/* ====================================
          PUBLIC ROUTES
      ==================================== */}

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      {/* ====================================
          PROTECTED ROUTES
      ==================================== */}

      <Route element={<ProtectedRoute />}>

        <Route element={<AppShell />}>

          {/* DASHBOARD */}

          <Route
            index
            element={<Home />}
          />

          {/* =================================
              REVIEWERS
          ================================= */}

          <Route
            path="reviewers"
            element={<ReviewersPage />}
          />

          <Route
            path="reviewers/:reviewerId"
            element={<ReviewerPage />}
          />

          <Route
            path="reviewers/:reviewerId/edit"
            element={<EditReviewerPage />}
          />

          <Route
            path="my-reviewers"
            element={
              <Navigate
                to="/reviewers"
                replace
              />
            }
          />

          {/* CREATE REVIEWER */}

          <Route
            path="create"
            element={<CreateReviewer />}
          />

          {/* =================================
              MATERIALS
          ================================= */}

          <Route
            path="materials"
            element={<MaterialsPage />}
          />

          {/* =================================
              FLASHCARDS
          ================================= */}

          <Route
            path="flashcards"
            element={<FlashcardsPage />}
          />

          <Route
            path="flashcards/:setId"
            element={<FlashcardSetPage />}
          />

          <Route
            path="flashcards/:setId/study"
            element={<StudyPage />}
          />

          {/* =================================
              PRACTICE QUIZZES
          ================================= */}

          <Route
            path="quizzes"
            element={<QuizzesPage />}
          />

          <Route
            path="quizzes/:quizId"
            element={<QuizPage />}
          />

          {/* =================================
              PROFILE
          ================================= */}

          <Route
            path="profile"
            element={<ProfilePage />}
          />

          {/* =================================
              FALLBACK ROUTE
          ================================= */}

          <Route
            path="*"
            element={
              <Navigate
                to="/"
                replace
              />
            }
          />

        </Route>
      </Route>

      {/* UNKNOWN PUBLIC ROUTES */}

      <Route
        path="*"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

    </Routes>
  );
}
