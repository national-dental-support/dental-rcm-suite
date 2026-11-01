export const handleSplitString = (fullName: string) => {
    let parts = fullName.trim().split(" ");
    let  str1 = parts[0] || "";
    let str2 = parts.slice(1).join(" ") || ""; // Handles multiple last names
    return { str1, str2 };
}
