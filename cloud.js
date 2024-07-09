require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const port = 5001;

class Estudiante {
    constructor(id, nombre, apellido, huella, rol) {
        this.id = id;
        this.nombre = nombre;
        this.apellido = apellido;
        this.huella = huella;
        this.rol = rol;
    }
}

let curso_id = 1;
let estudiante = new Estudiante();
let huella = null;

app.use(cors());
app.use(express.json());

let currentCommand = null;

app.get('/set-command', (req, res) => {
    const command = req.query.command;
    if (command === 'enroll') {
        const id = req.query.id;
        if (id) {
            currentCommand = `enroll ${id}`;
            res.json({ status: 'command set', command: currentCommand });
        } else {
            res.status(400).json({ status: 'error', message: 'ID missing' });
        }
    } else if (command === 'recognize') {
        currentCommand = 'recognize';
        res.json({ status: 'command set', command: currentCommand });
    } else {
        res.status(400).json({ status: 'error', message: 'Invalid command' });
    }
});

app.get('/get-command', (req, res) => {
    if (currentCommand) {
        const command = currentCommand;
        currentCommand = null;
        res.send(command);
    } else {
        res.status(204).send();
    }
});

const db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err.message);
    } else {
        console.log('Connected to the MySQL database.');
    }
});

const createEstudianteTable = `
    CREATE TABLE IF NOT EXISTS ESTUDIANTE (
        ID INT PRIMARY KEY,
        NOMBRE VARCHAR(255),
        APELLIDO VARCHAR(255),
        HUELLA BLOB,
        ROL ENUM('ESTUDIANTE', 'PROFESOR')
    );
`;

const createCursoTable = `
    CREATE TABLE IF NOT EXISTS CURSO (
        ID INT PRIMARY KEY,
        NOMBRE VARCHAR(255) NOT NULL
    );
`;

const createAsistenciasTable = `
    CREATE TABLE IF NOT EXISTS ASISTENCIAS (
        ID_ESTUDIANTE INT,
        ID_CURSO INT,
        FECHA_HORA DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ID_ESTUDIANTE, ID_CURSO, FECHA_HORA),
        FOREIGN KEY (ID_ESTUDIANTE) REFERENCES ESTUDIANTE(ID),
        FOREIGN KEY (ID_CURSO) REFERENCES CURSO(ID)
    );
`;

db.query(createEstudianteTable, (err) => {
    if (err) {
        console.error('Error creating ESTUDIANTE table:', err.message);
    } else {
        console.log('ESTUDIANTE table created or already exists.');
    }
});

db.query(createCursoTable, (err) => {
    if (err) {
        console.error('Error creating CURSO table:', err.message);
    } else {
        console.log('CURSO table created or already exists.');
    }
});

db.query(createAsistenciasTable, (err) => {
    if (err) {
        console.error('Error creating ASISTENCIAS table:', err.message);
    } else {
        console.log('ASISTENCIAS table created or already exists.');
    }
});


app.post('/enroll', (req, res) => {
    const { id, template } = req.body;
    const buffer = Buffer.from(template, 'hex');
    huella = buffer;
    res.status(200).json({ status: 'success' });
});

app.get('/found', (_, res) => {
    if (huella) {
        res.status(200).json({ status: 'found' });
    } else {
        res.status(404).json({ status: 'not_found' });
    }
});

app.post('/save', (req, res) => {
    const {id, nombre, apellido, rol } = req.body;
    console.log(`Nombre: ${nombre}, Apellido: ${apellido}, Rol: ${rol}`);

    const query = 'INSERT INTO ESTUDIANTE (ID, NOMBRE, APELLIDO, HUELLA, ROL) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [id, nombre, apellido, huella, rol], (err, results) => {
        if (err) {
            console.error('Error inserting into ESTUDIANTE table:', err.message);
            huella = null;
            res.status(500).json({ status: 'error', message: err.message });
        } else {
            console.log(`Inserted into ESTUDIANTE: ID=${results.insertId}, NOMBRE=${nombre}, APELLIDO=${apellido}, ROL=${rol}`);
            huella = null;
            res.status(200).json({ status: 'success', id: results.insertId });
        }
    });
});

app.post('/recognize', (req, res) => {
    const { id } = req.body;
    console.log(`ID received in request body: ${id}`);

    const query = 'SELECT * FROM ESTUDIANTE WHERE ID = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            res.status(500).json({ status: 'error', message: err.message });
        } else if (results.length > 0) {
            const estudiante_id = results[0].ID;
            res.status(200).json({ status: 'recognized', id: estudiante_id });

            const insertAsistencia = 'INSERT INTO ASISTENCIAS (ID_ESTUDIANTE, ID_CURSO) VALUES (?, ?)';
            db.query(insertAsistencia, [estudiante_id, curso_id], (err) => {
                if (err) {
                    console.error('Error inserting into ASISTENCIAS table:', err.message);
                } else {
                    console.log(`Inserted into ASISTENCIAS: ID_ESTUDIANTE=${estudiante_id}, ID_CURSO=${curso_id}`);
                }
            });
        } else {
            res.status(404).json({ status: 'not_recognized' });
        }
    });
});

app.get('/asistencia', (_req, res) => {
    const query = `
        SELECT 
            E.ID AS estudiante_id, 
            E.NOMBRE AS estudiante_nombre, 
            E.APELLIDO AS estudiante_apellido, 
            C.NOMBRE AS curso_nombre, 
            A.FECHA_HORA AS asistencia_hora
        FROM ASISTENCIAS A
        JOIN ESTUDIANTE E ON A.ID_ESTUDIANTE = E.ID
        JOIN CURSO C ON A.ID_CURSO = C.ID
    `;

    db.query(query, (err, rows) => {
        if (err) {
            res.status(500).json({ status: 'error', message: err.message });
        } else {
            res.status(200).json(rows);
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
