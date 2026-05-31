FROM python:3.9-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install small system deps commonly needed by Python packages
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
	   gcc \
	   libpq-dev \
	&& rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
	&& pip install --no-cache-dir -r /app/requirements.txt

# Copy project files
COPY . /app/

# Ensure static directory exists (collectstatic can run at runtime)
RUN mkdir -p /app/staticfiles

# Expose Django default port
EXPOSE 8000

# Default command: run Django development server. You can override in docker-compose or when running.
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]