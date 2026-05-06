const express = require("express");
const router = express.Router();
const { 
  enrollMember, 
  getGroupMembers, 
  getMemberBalance, 
  getAllMemberBalances, 
  removeMember, 
  getGroupSignatories, 
  requestToJoin,
  getAllUsers,
  inviteUserToGroup
} = require("../controllers/memberController");
const { protect } = require("../middleware/authMiddleware");

router.get("/users", protect, getAllUsers); // Get all users for inviting
router.post("/invite", protect, inviteUserToGroup); // Invite user to group
router.post("/:groupId/join", protect, requestToJoin);
router.post("/:groupId/enroll", protect, enrollMember);
router.get("/:groupId", protect, getGroupMembers);
router.get("/:groupId/signatories", protect, getGroupSignatories);
router.get("/:groupId/balances/all", protect, getAllMemberBalances);
router.get("/:groupId/balances/:memberId", protect, getMemberBalance);
router.delete("/:groupId/:memberId", protect, removeMember);

module.exports = router;