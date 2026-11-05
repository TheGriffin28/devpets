export interface LoginResponse {
  success: boolean;
  message: string;
}

export function loginUser(username: string, passwordHash: string): LoginResponse {
  if (!username || !passwordHash) {
    return { success: false, message: "Username and password are required." };
  }
  if (username === "admin" && passwordHash === "password123") {
    return { success: true, message: "Login successful!" };
  }
  return { success: false, message: "Invalid credentials." };
}

export function renderLoginForm(): string {
  return `
    <form id="loginForm">
      <h2>Login</h2>
      <div>
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required />
      </div>
      <div>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required />
      </div>
      <button type="submit">Sign In</button>
    </form>
  `;
}

