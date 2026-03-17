# Database (MySQL)

## Run the schema (recommended)

**Python script** (works on any OS):

```bash
# From project root, with backend venv activated (PyMySQL is already installed):
cd backend
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
cd ..
python database/run_schema.py
```

Or from the `database` folder:

```bash
pip install pymysql   # if not using backend venv
python run_schema.py
```

The script loads `MYSQL_*` from `backend/.env` if present (same as the backend app), else uses defaults: `root` @ `localhost:3306`, database `security_verification`. Set `MYSQL_PASSWORD` in `backend/.env` or in the environment so the script can connect without prompting.

It creates the database if it does not exist, then applies `schema.sql`.

**Existing databases:** If you already had the `users` table before the multi-pose face feature, run the migration to add the new column:

```bash
mysql -u root -p security_verification < database/migrations/001_add_face_encodings_json.sql
```
(If you get "Duplicate column name", the column already exists and you can ignore it.)

## Manual setup

1. **Create database and user** (optional; can use root):

   ```sql
   CREATE DATABASE security_verification CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'svuser'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL ON security_verification.* TO 'svuser'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. **Apply schema**:

   ```bash
   mysql -u root -p security_verification < schema.sql
   ```

   Or from MySQL client:

   ```sql
   USE security_verification;
   SOURCE /path/to/database/schema.sql;
   ```

3. **Configure backend** in `backend/.env`:

   ```
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=security_verification
   ```

The Flask app can also create tables via SQLAlchemy `db.create_all()` if they don’t exist; this schema is for reference or manual setup.
