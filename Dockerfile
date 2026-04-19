# ─── Stage 1: Build ───────────────────────────────────────────────
FROM maven:3.9.6-eclipse-temurin-17 AS build

WORKDIR /app

# Dependencies pehle copy karo (caching ke liye)
COPY backend/pom.xml .
RUN mvn dependency:go-offline -B

# Source copy karo aur build karo
COPY backend/src ./src
RUN mvn clean package -Dmaven.test.skip=true

# ─── Stage 2: Run ─────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine

# libpcap install karo ← YE ADD KARO
RUN apk add --no-cache libpcap

WORKDIR /app

COPY --from=build /app/target/netwatch-backend.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
