from flask import Flask, request, jsonify
import hashlib
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS so the frontend can communicate with this server

@app.route('/hash_data', methods=['POST'])
def hash_data():
    # Get the data from the POST request
    data = request.json.get('data', '')
    if data:
        # Create a hash using SHA-256 (Ethereum hash style)
        hashed_data = hashlib.sha256(data.encode()).hexdigest()
        return jsonify({'hashed_data': hashed_data})
    return jsonify({'error': 'No data provided'}), 400

if __name__ == '__main__':
    app.run(debug=True)
