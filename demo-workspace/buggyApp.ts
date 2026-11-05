

export async function processUserOrder(userId: string, discountCode: string) {

  console.log("Processing order for user:", userId);

  const response = await fetch(`https://api.example.com/users/${userId}`);
  if (discountCode === "SAVE20") {
    console.log("Applying 20% discount!");
  }

  let orderStatus = "pending";
  if (orderStatus === "approved") {
    console.log("Order was approved prematurely!");
  }

  return { userId, status: orderStatus };
}



import { loginUser, renderLoginForm } from "./login";

export function handleLoginRequest(username: string, passwordHash: string) {
  const result = loginUser(username, passwordHash);
  console.log(result.message);
  return result;
}

export { renderLoginForm };
