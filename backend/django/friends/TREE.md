friends/
├── __init__.py
├── admin.py
├── apps.py
├── models.py
│   ├── FriendRequest
│   └── FriendList (optional)
├── views.py
│   ├── SendFriendRequestView
│   ├── AcceptFriendRequestView
│   ├── DeclineFriendRequestView
│   ├── FriendListView
│   └── RemoveFriendView
├── serializers.py
│   ├── FriendRequestSerializer
│   ├── SendFriendRequestSerializer
│   └── FriendListSerializer
├── urls.py
└── tests/
    ├── __init__.py
    ├── test_models.py
    ├── test_serializers.py
    └── test_views.py

