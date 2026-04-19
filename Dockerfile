# ─── Stage 1: Build ───────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

# Dependencies pehle copy karo (caching ke liye)
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Source copy karo aur build karo
COPY src ./src
RUN mvn clean package -DskipTests

# ─── Stage 2: Run ─────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Sirf JAR copy karo build stage se
COPY --from=build /app/target/netwatch-backend.jar app.jar

# Port expose karo
EXPOSE 8080

# Run karo
ENTRYPOINT ["java", "-jar", "app.jar"]