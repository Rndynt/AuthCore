# Design Guidelines for Auth Service Dashboard

## Design Approach
**System-Based Approach (Design System)**: This is a utility-focused authentication service requiring high efficiency, security clarity, and professional reliability. Using **Material Design 3** principles for clean, functional interface with strong visual feedback for auth states.

## Core Design Elements

### Color Palette
**Light Mode:**
- Primary: 219 69% 50% (Professional blue)
- Surface: 0 0% 98% (Clean white background)
- Surface Variant: 220 14% 96% (Subtle gray sections)
- Error: 0 68% 52% (Clear red for auth failures)
- Success: 142 71% 45% (Green for successful auth)

**Dark Mode:**
- Primary: 219 69% 65% (Lighter blue for contrast)
- Surface: 220 13% 9% (Deep dark background)
- Surface Variant: 220 9% 15% (Elevated dark surfaces)
- Error: 0 68% 62% (Accessible red)
- Success: 142 71% 55% (Accessible green)

### Typography
- **Primary Font**: Inter via Google Fonts CDN
- **Headings**: 600-700 weight, clear hierarchy (32px/24px/20px/16px)
- **Body**: 400 weight, 16px base with 1.5 line height
- **Code/Tokens**: JetBrains Mono, 14px for API keys, tokens

### Layout System
**Tailwind Spacing**: Use 4, 6, 8, 12 units consistently
- Container padding: `p-6` or `p-8`
- Component spacing: `space-y-4` between sections
- Form fields: `mb-4` standard spacing
- Card padding: `p-6`

### Component Library

#### Authentication Forms
- **Clean card-based forms** with subtle shadows
- **Input states**: Default, focused (blue outline), error (red outline), success (green outline)
- **Password visibility toggle** with eye icon
- **Submit buttons**: Full-width primary, disabled state with spinner
- **Form validation**: Inline error messages below fields

#### Navigation & Layout
- **Sidebar navigation** for admin features with clear auth status
- **Top header** showing current user, org context, logout
- **Breadcrumbs** for multi-level admin sections

#### Data Display
- **Session status cards** with clear online/offline indicators
- **API key management** with copy-to-clipboard functionality
- **User tables** with role badges, last login timestamps
- **Organization hierarchy** with tree-view components

#### Feedback & Status
- **Toast notifications** for auth success/failure
- **Loading states** with skeleton screens during auth checks
- **Empty states** with helpful guidance for new orgs/users
- **Status indicators**: Online (green dot), Offline (gray dot), Admin (gold badge)

#### Security-Focused Elements
- **Two-factor setup flows** with QR code displays
- **API key generation** with one-time display warnings
- **Session management** with device/location info
- **Audit logs** with timestamp and action clarity

### Visual Hierarchy
- **Auth status always visible** in header
- **Primary actions** (Login, Create API Key) use primary color
- **Destructive actions** (Logout, Revoke) use error color with confirmation
- **Success states** clearly marked with checkmarks and green accents

### Responsive Design
- **Mobile-first** forms with large touch targets
- **Admin tables** collapse to card layouts on small screens
- **Sidebar navigation** converts to bottom tabs on mobile

This design system prioritizes **security clarity**, **professional appearance**, and **efficient task completion** while maintaining accessibility and consistency across all authentication workflows.