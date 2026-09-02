CXX       := g++
CXXFLAGS  := -std=c++17 -g3 -O0 -Wall -Wextra -Werror -Iincs -MMD -MP
#LDFLAGS   := -lssl -lcrypto
LDFLAGS   := -static

TARGET    := bin/chess_engine
SOURCES   := srcs/engine_server.cpp
OBJECTS   := objs/engine_server.o
DEPS      := $(OBJECTS:.o=.d)

.PHONY: all clean

all: $(TARGET)

# Compile .cpp -> auto-generating dependency files
objs/%.o: srcs/%.cpp
	@mkdir -p objs
	$(CXX) $(CXXFLAGS) -c $< -o $@

# Link
$(TARGET): $(OBJECTS)
	@mkdir -p bin
	$(CXX) $(OBJECTS) -o $(TARGET) $(LDFLAGS)

# Include generated dependency files (silently ignore if missing)
-include $(DEPS)

clean:
	rm -rf objs 
	-rm -rf bin/*

