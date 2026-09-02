from django.test import TestCase
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from PIL import Image
import io
import tempfile

User = get_user_model()


class UserModelTests(TestCase):
    def test_create_user(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))
        self.assertEqual(user.wins, 0)
        self.assertEqual(user.loss, 0)
        self.assertEqual(user.draw, 0)
        self.assertEqual(user.rating, 1200)

    def test_create_user_with_dispname(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            dispname="Test User"
        )
        self.assertEqual(user.dispname, "Test User")
        self.assertEqual(user.get_display_name(), "Test User")

    def test_get_display_name_fallback(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        self.assertEqual(user.get_display_name(), "testuser")

    def test_update_state_win(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        user.update_state("win")
        self.assertEqual(user.wins, 1)
        self.assertEqual(user.rating, 1210)

    def test_update_state_loss(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        user.update_state("loss")
        self.assertEqual(user.loss, 1)
        self.assertEqual(user.rating, 1190)

    def test_update_state_draw(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        user.update_state("draw")
        self.assertEqual(user.draw, 1)
        self.assertEqual(user.rating, 1200)

    def test_update_state_invalid(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )
        with self.assertRaises(ValueError) as context:
            user.update_state("invalid")
        self.assertIn("Invalid result state: invalid", str(context.exception))

    def test_friend_request_creation(self):
        from users.models import FriendRequest
        
        user1 = User.objects.create_user(username="alice", email="alice@example.com", password="pass")
        user2 = User.objects.create_user(username="bob", email="bob@example.com", password="pass")
        
        friend_request = FriendRequest.objects.create(
            from_user=user1,
            to_user=user2
        )
        self.assertEqual(friend_request.from_user, user1)
        self.assertEqual(friend_request.to_user, user2)
        self.assertFalse(friend_request.accepted)
        self.assertIsNotNone(friend_request.created_at)

    def test_friend_request_unique_together(self):
        from users.models import FriendRequest
        
        user1 = User.objects.create_user(username="alice", email="alice@example.com", password="pass")
        user2 = User.objects.create_user(username="bob", email="bob@example.com", password="pass")
        
        FriendRequest.objects.create(from_user=user1, to_user=user2)
        
        with self.assertRaises(Exception):
            FriendRequest.objects.create(from_user=user1, to_user=user2)

    def test_friend_request_str(self):
        from users.models import FriendRequest
        
        user1 = User.objects.create_user(username="alice", email="alice@example.com", password="pass")
        user2 = User.objects.create_user(username="bob", email="bob@example.com", password="pass")
        
        friend_request = FriendRequest.objects.create(from_user=user1, to_user=user2)
        self.assertEqual(str(friend_request), "alice -> bob (pending)")
        
        friend_request.accepted = True
        friend_request.save()
        self.assertEqual(str(friend_request), "alice -> bob (accepted)")


class AvatarTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123"
        )

    def create_test_image(self, filename="test.png"):
        """Helper to create a test image file"""
        image = Image.new("RGB", (100, 100), color="red")
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="PNG")
        image_bytes.seek(0)
        return SimpleUploadedFile(filename, image_bytes.getvalue(), content_type="image/png")

    def test_avatar_upload(self):
        avatar_file = self.create_test_image()
        self.user.avatar.save("test.png", avatar_file)
        self.assertIsNotNone(self.user.avatar)
        self.assertTrue(self.user.avatar.name.startswith("avatars/testuser_"))
        self.assertTrue(self.user.avatar.name.endswith(".png"))

    def test_avatar_file_extension_validation(self):
        """Test that non-image files are rejected"""
        invalid_file = SimpleUploadedFile("test.txt", b"not an image", content_type="text/plain")
        self.user.avatar = invalid_file

        with self.assertRaises(ValidationError):
            self.user.full_clean()  # ← Add this
            self.user.save()

    def test_avatar_default_value(self):
        self.assertEqual(self.user.avatar, "avatars/default_avatar.png")

