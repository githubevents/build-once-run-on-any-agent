def vulnerable_login(username, password):
    # BAD: SQL injection vulnerability
    query = f"SELECT * FROM users WHERE username = \"{username}\" AND password = \"{password}\""
    # BAD: Hardcoded secret
    API_KEY = "sk-1234567890abcdef"
    return query
