// Sensor de proximidad con alerta (Qubbot · Laboratorio Arduino)
// Mide la distancia con un HC-SR04 y avisa con 3 LEDs y un buzzer:
//   verde = lejos (más de 50 cm), amarillo = cerca (20 a 50 cm), rojo y pitido = muy cerca (menos de 20 cm).
// Código original de Qubbot para aprender; úsalo y cámbialo como quieras.

const int PIN_TRIG = 9;      // el Arduino manda aquí el pulso que dispara el sensor
const int PIN_ECHO = 10;     // el sensor responde con un pulso tan largo como el viaje del sonido
const int LED_VERDE = 2;
const int LED_AMARILLO = 3;
const int LED_ROJO = 4;
const int BUZZER = 8;        // buzzer pasivo: suena con la frecuencia que le damos con tone()

const long CERCA_CM = 50;
const long MUY_CERCA_CM = 20;

void setup() {
  Serial.begin(9600);        // para ver la distancia en el monitor serie
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);
  pinMode(BUZZER, OUTPUT);
}

// Devuelve la distancia en centímetros (0 si no volvió el eco: no hay nada delante)
long medirDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);    // un pulso de 10 µs pide una medición
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duracion = pulseIn(PIN_ECHO, HIGH, 30000);  // µs que tardó el sonido en ir y volver
  return duracion / 58;            // el sonido hace 1 cm de ida y vuelta en unos 58 µs
}

void loop() {
  long cm = medirDistancia();
  Serial.print("Distancia: ");
  Serial.print(cm);
  Serial.println(" cm");

  bool lejos = cm == 0 || cm > CERCA_CM;
  bool muyCerca = cm > 0 && cm < MUY_CERCA_CM;
  digitalWrite(LED_VERDE, lejos ? HIGH : LOW);
  digitalWrite(LED_AMARILLO, (!lejos && !muyCerca) ? HIGH : LOW);
  digitalWrite(LED_ROJO, muyCerca ? HIGH : LOW);

  if (muyCerca) {
    tone(BUZZER, 2000 - cm * 50);  // más cerca, más agudo
  } else {
    noTone(BUZZER);
  }
  delay(100);
}
